import * as Speech from 'expo-speech';

interface SpeakOptions {
  /** Called when speech finishes (or errors). */
  onDone?: () => void;
  /** Speech rate: 0.5 (slow) to 2.0 (fast). Default 0.9 for clarity. */
  rate?: number;
}

/**
 * Speak a phrase using system TTS.
 * ElevenLabs voice clone will replace this in MVP 1.1.
 */
export async function speakPhrase(text: string, options?: SpeakOptions): Promise<void> {
  if (!text.trim()) return;

  // Stop any in-progress speech first
  await Speech.stop();

  return new Promise<void>((resolve) => {
    Speech.speak(text, {
      language: 'en-US',
      rate: options?.rate ?? 0.9,
      onDone: () => {
        options?.onDone?.();
        resolve();
      },
      onError: () => {
        // Resolve even on error — don't block the UI
        options?.onDone?.();
        resolve();
      },
    });
  });
}

/** Check if system TTS is currently speaking. */
export async function isSpeaking(): Promise<boolean> {
  return Speech.isSpeakingAsync();
}

/** Stop any in-progress speech. */
export async function stopSpeaking(): Promise<void> {
  await Speech.stop();
}
