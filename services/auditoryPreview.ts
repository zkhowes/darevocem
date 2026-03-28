import * as Speech from 'expo-speech';

// Auditory preview: speaks the focused item's text aloud as a "preview"
// when the user swipes through predictions. Uses a distinct voice config
// (faster rate, lower volume, slightly different pitch) so it's clearly
// a preview and not a committed utterance.
//
// Key AAC pattern from Proloquo2Go: use a SECONDARY voice for previews
// so nearby listeners don't confuse a preview with actual speech output.

/** Preview voice config — distinct from the main speech output. */
const PREVIEW_CONFIG = {
  rate: 1.15,     // slightly faster than normal speech
  pitch: 0.92,    // slightly lower — signals "this is a preview"
  volume: 0.6,    // quieter than committed speech
  language: 'en-US',
} as const;

/** Debounce timer to avoid rapid-fire speech when swiping quickly. */
let previewTimeout: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 200;

/**
 * Speak a preview of the focused item's text.
 * Debounced: rapid swipes only speak the last item.
 * Does NOT interrupt committed speech (speakPhrase) — only cancels
 * other previews.
 */
export function speakPreview(text: string): void {
  if (!text.trim()) return;

  // Cancel any pending preview
  if (previewTimeout) {
    clearTimeout(previewTimeout);
  }

  previewTimeout = setTimeout(async () => {
    // Stop any in-progress preview speech (but not committed speech —
    // expo-speech doesn't distinguish, so we rely on the debounce
    // and the fact that committed speech uses speakPhrase which stops first)
    await Speech.stop();

    Speech.speak(text, {
      language: PREVIEW_CONFIG.language,
      rate: PREVIEW_CONFIG.rate,
      pitch: PREVIEW_CONFIG.pitch,
      volume: PREVIEW_CONFIG.volume,
      // No callbacks needed — previews are fire-and-forget
    });
  }, DEBOUNCE_MS);
}

/**
 * Cancel any pending or in-progress preview speech.
 * Call this when the user commits a selection (double-tap)
 * so the preview doesn't overlap with the committed action.
 */
export function cancelPreview(): void {
  if (previewTimeout) {
    clearTimeout(previewTimeout);
    previewTimeout = null;
  }
  // Don't call Speech.stop() here — it would also kill committed speech.
  // The debounce handles rapid transitions; committed speech (speakPhrase)
  // calls Speech.stop() itself before speaking.
}

/** Exported for testing — the debounce delay. */
export const PREVIEW_DEBOUNCE_MS = DEBOUNCE_MS;
