import { supabase } from './supabase';
import { FALLBACK_PREDICTIONS } from '../constants/fallbacks';
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
): Promise<ComposeItem[]> {
  try {
    const { data, error } = await supabase.functions.invoke('predict', {
      body: {
        intent,
        currentPhrase,
        currentSlot,
        sessionContext: { timeOfDay, recentSelections, recentRejections },
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
 * Returns alternative predictions excluding the item Amanda already rejected.
 * Currently served from curated fallbacks; will use the Edge Function in a
 * future task when the refinement slot type is wired up.
 */
export async function getRefinements(
  intent: string,
  currentPhrase: string[],
  originalItem: string,
): Promise<ComposeItem[]> {
  // Filter out the item being replaced so Amanda always sees new options
  return fallbacksForIntent(intent).filter((p) => p.text !== originalItem);
}

/**
 * Returns modifier extensions for a selected item ("coffee and...", "coffee with...").
 * These let Amanda append nuance to a word she's already chosen.
 */
export async function getModifiers(
  intent: string,
  currentPhrase: string[],
  targetItem: string,
): Promise<ComposeItem[]> {
  const modifiers = [`${targetItem} and...`, `${targetItem} with...`, `${targetItem} but...`];
  return modifiers.map((text, i) => ({
    id: generateId(),
    text,
    itemType: 'prediction' as const,
    rank: i,
  }));
}
