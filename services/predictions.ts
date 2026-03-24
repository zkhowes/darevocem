import { supabase } from './supabase';
import { FALLBACK_PREDICTIONS, FALLBACK_MODIFIERS } from '../constants/fallbacks';
import { generateId } from '../types';
import type { ComposeItem, TimeOfDay } from '../types';

// PredictionResponse is defined in types/index.ts but uses Prediction[]
// (which has type: SlotType). The edge function returns { text, type: string }
// so we define a local looser type for the raw API response.
interface RawPrediction {
  text: string;
  type: string;
}

interface EdgePredictionResponse {
  predictions: RawPrediction[];
  fallback: boolean;
}

// Returns fallback ComposeItems for the given intent, using curated constants.
// Falls back to 'I need' defaults if the intent isn't in the map.
function fallbacksForIntent(intent: string): ComposeItem[] {
  const texts = FALLBACK_PREDICTIONS[intent] ?? FALLBACK_PREDICTIONS['I need'];
  return texts.map((text, i) => ({
    id: generateId(),
    text,
    itemType: 'prediction' as const,
    rank: i,
  }));
}

/**
 * Fetches AI-powered predictions for the next slot in the composed phrase.
 * Routes through the Supabase Edge Function (predict), which holds the
 * Anthropic API key server-side. Falls back to curated constants on any error.
 */
export async function getPredictions(
  intent: string,
  currentPhrase: string[],
  currentSlot: string,
  timeOfDay: TimeOfDay,
  recentSelections: string[],
  recentRejections: string[],
  triedPaths?: string[][],
): Promise<ComposeItem[]> {
  try {
    const { data, error } = await supabase.functions.invoke('predict', {
      body: {
        intent,
        currentPhrase,
        currentSlot,
        sessionContext: { timeOfDay, recentSelections, recentRejections },
        triedPaths: triedPaths ?? [],
      },
    });

    if (error || !data || data.fallback) {
      return fallbacksForIntent(intent);
    }

    const response = data as EdgePredictionResponse;
    if (response.predictions.length === 0) {
      return fallbacksForIntent(intent);
    }

    return response.predictions.map((p, i) => ({
      id: generateId(),
      text: p.text,
      itemType: 'prediction' as const,
      rank: i,
    }));
  } catch {
    // Network timeout, parse error, or any unexpected failure — serve curated defaults
    return fallbacksForIntent(intent);
  }
}

/**
 * Returns connector/modifier words for a selected item ("and", "or", "with"...).
 * Returns plain string[] — these are connector words, not selectable ComposeItems.
 * Routes through the Edge Function; falls back to FALLBACK_MODIFIERS on any error.
 */
export async function getModifiers(
  intent: string,
  currentPhrase: string[],
  targetItem: string,
): Promise<string[]> {
  try {
    const { data, error } = await supabase.functions.invoke('predict', {
      body: {
        intent,
        currentPhrase,
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
