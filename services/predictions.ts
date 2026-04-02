import { supabase } from './supabase';
import { FALLBACK_PREDICTIONS, FALLBACK_MODIFIERS } from '../constants/fallbacks';
import { generateId } from '../types';
import type { ComposeItem, TimeOfDay } from '../types';

declare const __DEV__: boolean;

interface RawPrediction {
  text: string;
  wordType?: string;
}

interface EdgePredictionResponse {
  predictions: RawPrediction[];
  fallback: boolean;
  debug?: {
    promptSent: string;
    rawResponse: string;
    latencyMs: number;
    source: string;
  };
}

// Continuation fallbacks when the phrase already has words beyond the intent.
const FALLBACK_CONTINUATIONS: string[] = [
  'please', 'now', 'today', 'right now', 'soon',
  'and', 'with', 'for', 'but', 'or',
];

/**
 * Returns curated fallback predictions for a given phrase.
 * Extracts the intent (first 1-2 words) to look up relevant defaults,
 * then filters out any items the user has already rejected.
 */
function getFallbacks(fullPhrase: string, triedItems: string[] = []): ComposeItem[] {
  const tried = new Set(triedItems.map((t) => t.toLowerCase()));
  const words = fullPhrase.trim().split(/\s+/);

  // If the phrase is just an intent (1-2 words), use initial predictions
  if (words.length <= 2) {
    // Try to match the intent to our fallback map
    const intentKey = Object.keys(FALLBACK_PREDICTIONS).find(
      (key) => fullPhrase.toLowerCase().startsWith(key.toLowerCase()),
    );
    const allTexts = FALLBACK_PREDICTIONS[intentKey ?? 'I need'];
    const filtered = allTexts.filter((t) => !tried.has(t.toLowerCase()));
    const texts = filtered.length > 0 ? filtered : allTexts;
    return texts.map((text, i) => ({
      id: generateId(),
      text,
      itemType: 'prediction' as const,
      rank: i,
    }));
  }

  // Phrase has words beyond intent — use continuation fallbacks
  const filtered = FALLBACK_CONTINUATIONS.filter((t) => !tried.has(t.toLowerCase()));
  const texts = filtered.length > 0 ? filtered : FALLBACK_CONTINUATIONS;
  return texts.map((text, i) => ({
    id: generateId(),
    text,
    itemType: 'prediction' as const,
    rank: i,
  }));
}

/**
 * Fetches AI predictions for what comes next in the phrase.
 * Sends the FULL phrase (intent + all selected words) so Claude sees
 * the complete sentence being built.
 *
 * Falls back to curated constants on any error.
 */
export async function getPredictions(
  fullPhrase: string,
  timeOfDay: TimeOfDay,
  triedItems?: string[],
): Promise<ComposeItem[]> {
  try {
    const startMs = Date.now();
    const { data, error } = await supabase.functions.invoke('predict', {
      body: {
        fullPhrase,
        requestType: 'next',
        timeOfDay,
        triedItems: triedItems ?? [],
      },
    });

    if (__DEV__) {
      const elapsed = Date.now() - startMs;
      console.log(`[Predict] next "${fullPhrase}" → ${data?.predictions?.length ?? 0} results (${elapsed}ms, fallback=${data?.fallback ?? 'error'})`);
      if (error) console.log('[Predict] INVOKE ERROR:', error?.message ?? error);
      if (data?.claudeError) console.log('[Predict] CLAUDE ERROR:', data.claudeError);
      // Log wordType presence for Fitzgerald color debugging
      if (data?.predictions?.length > 0) {
        const sample = data.predictions[0];
        console.log(`[Predict] sample prediction: ${JSON.stringify(sample)}`);
      }
      if (data?.debug) console.log('[Predict] debug:', JSON.stringify(data.debug, null, 2));
    }

    if (error || !data || data.fallback) {
      return getFallbacks(fullPhrase, triedItems);
    }

    const response = data as EdgePredictionResponse;
    if (response.predictions.length === 0) {
      return getFallbacks(fullPhrase, triedItems);
    }

    return response.predictions.map((p, i) => ({
      id: generateId(),
      text: p.text,
      itemType: 'prediction' as const,
      rank: i,
      ...(p.wordType ? { wordType: p.wordType as import('../types').WordType } : {}),
    }));
  } catch (err) {
    if (__DEV__) console.log('[Predict] error:', err);
    return getFallbacks(fullPhrase, triedItems);
  }
}

/**
 * Fetches AI-generated common phrases for the current time of day.
 */
export async function getCommonPhrases(
  timeOfDay: TimeOfDay,
): Promise<ComposeItem[]> {
  try {
    const { data, error } = await supabase.functions.invoke('predict', {
      body: {
        requestType: 'common_phrases',
        timeOfDay,
      },
    });

    if (error || !data || data.fallback || !data.phrases || data.phrases.length === 0) {
      return fallbackCommonPhrases(timeOfDay);
    }

    return data.phrases.map((p: { text: string }, i: number) => ({
      id: generateId(),
      text: p.text,
      itemType: 'common' as const,
      rank: i,
    }));
  } catch {
    return fallbackCommonPhrases(timeOfDay);
  }
}

function fallbackCommonPhrases(timeOfDay: TimeOfDay): ComposeItem[] {
  const phrases: Record<TimeOfDay, string[]> = {
    morning: ['I need coffee and cream', 'What time is my appointment today', 'Good morning', 'I want breakfast', 'I need my medication'],
    afternoon: ['I want to get outside today', 'What are we doing this afternoon', 'I need to rest', 'Can we go for a walk', 'What time is it'],
    evening: ['What is for dinner tonight', 'I want to watch something', 'I feel tired', 'Can we talk for a bit', 'I love you'],
    night: ['I need to go to bed', 'I need my medication', 'Good night', 'I need water', 'I feel tired'],
  };
  return (phrases[timeOfDay] ?? phrases.morning).map((text, i) => ({
    id: generateId(),
    text,
    itemType: 'common' as const,
    rank: i,
  }));
}

/**
 * Fetches alternative intents using AI prediction.
 * Given the current intent, asks Claude for semantically related alternatives.
 * Falls back to cycling through the curated INTENTS list.
 */
export async function getAlternativeIntent(
  currentIntent: string,
  triedIntents: string[],
): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke('predict', {
      body: {
        fullPhrase: currentIntent,
        requestType: 'intent_alternative',
        triedItems: triedIntents,
      },
    });

    if (error || !data || !data.intent) {
      return null;
    }

    return data.intent as string;
  } catch {
    return null;
  }
}

/**
 * Fetches modifier/connector words for a selected item.
 */
export async function getModifiers(
  fullPhrase: string,
  targetItem: string,
): Promise<string[]> {
  try {
    const { data, error } = await supabase.functions.invoke('predict', {
      body: {
        fullPhrase,
        targetItem,
        requestType: 'modifiers',
      },
    });

    if (error || !data || !data.modifiers || data.modifiers.length === 0) {
      return FALLBACK_MODIFIERS;
    }

    return data.modifiers as string[];
  } catch {
    return FALLBACK_MODIFIERS;
  }
}
