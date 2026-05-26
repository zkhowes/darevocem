import type { Router } from 'expo-router';
import { useCompositionStore } from '../stores/composition';
import { getTimeOfDay } from '../services/context';
import { getCachedPredictions, getOrFetchPredictions } from '../services/predictionCache';

declare const __DEV__: boolean;

/**
 * Load an intent/starter into the compose flow and navigate there.
 *
 * Shared by the Home prediction cards and the Predicted "See all" L2 screen so
 * the two can't drift — selecting an item must behave identically in both.
 * Uses the prediction cache: a warm hit renders compose without a spinner; a
 * cold one fetches in the background while compose shows its loading state.
 */
export function openIntent(router: Router, intentText: string): void {
  const store = useCompositionStore.getState();
  const timeOfDay = getTimeOfDay();

  // Synchronous cache peek — avoids the loading flash when warm.
  const cached = getCachedPredictions(intentText, []);
  store.preload(intentText, cached ?? []);
  store.setLoading(!cached);

  if (!cached) {
    getOrFetchPredictions(intentText, timeOfDay).then(({ predictions, source }) => {
      if (__DEV__) console.log(`[openIntent] "${intentText}" → ${source}`);
      const s = useCompositionStore.getState();
      s.setPredictions(predictions);
      s.setLoading(false);
    });
  } else if (__DEV__) {
    console.log(`[openIntent] "${intentText}" → cache (sync)`);
  }

  router.push({ pathname: '/(app)/compose', params: { type: 'prediction', value: intentText } } as never);
}
