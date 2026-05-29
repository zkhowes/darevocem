import * as Clipboard from 'expo-clipboard';
import { Alert } from 'react-native';
import { speakSystem } from '../services/tts';

declare const __DEV__: boolean;

/**
 * Copy a phrase to the system clipboard with the same confirmation UX the
 * Save flow uses: spoken "Copied" (system voice — reading is hard for the
 * user) plus a brief visual alert. Shared by compose, saved, and common so
 * the user gets identical feedback wherever Copy is invoked.
 *
 * Truncates the alert preview at 60 chars to match the Save flow. Logs on
 * error in dev; surfaces a generic alert in production.
 */
export async function copyPhrase(phrase: string): Promise<void> {
  const trimmed = phrase.trim();
  if (!trimmed) return;
  try {
    await Clipboard.setStringAsync(trimmed);
    speakSystem('Copied');
    Alert.alert('Copied', `"${trimmed.slice(0, 60)}"`);
  } catch (err) {
    if (__DEV__) console.error('[copyPhrase] failed:', (err as Error).message);
    Alert.alert("Couldn't copy", 'Please try again.');
  }
}
