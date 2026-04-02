import * as Speech from 'expo-speech';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { cancelPreview } from './auditoryPreview';
import { VOICE } from '../constants/config';
import type { AudioCacheEntry } from '../types';

declare const __DEV__: boolean;

interface SpeakOptions {
  /** Called when speech finishes (or errors). */
  onDone?: () => void;
  /** Speech rate for system TTS fallback: 0.5 (slow) to 2.0 (fast). Default 0.9. */
  rate?: number;
  /** Force system TTS even if ElevenLabs is available. */
  useSystemTtsOnly?: boolean;
}

// Track the current player instance so we can stop it
let currentPlayer: AudioPlayer | null = null;

/**
 * Speak a phrase using the cloned voice (ElevenLabs via /speak edge function).
 * Falls back to system TTS on any error or if useSystemTtsOnly is true.
 *
 * Flow:
 * 1. Check audio cache (AsyncStorage) for this exact phrase
 * 2. If cached → play from cache via expo-audio
 * 3. If not cached → call /speak edge function → cache → play
 * 4. On any error → fall back to system TTS (expo-speech)
 */
export async function speakPhrase(text: string, options?: SpeakOptions): Promise<void> {
  if (!text.trim()) return;

  // Cancel any pending auditory preview so it doesn't fire after we start
  cancelPreview();

  // Stop any in-progress speech first
  await stopSpeaking();

  // System TTS only mode — skip ElevenLabs entirely
  if (options?.useSystemTtsOnly) {
    return speakWithSystemTts(text, options);
  }

  try {
    // Try cloned voice via ElevenLabs
    await speakWithClonedVoice(text, options);
  } catch (err) {
    if (__DEV__) {
      console.log('[tts] Cloned voice failed, falling back to system TTS:', (err as Error).message);
    }
    // Fallback to system TTS
    await speakWithSystemTts(text, options);
  }
}

/**
 * Speak using ElevenLabs cloned voice with caching.
 * Throws on any error so caller can fall back.
 */
async function speakWithClonedVoice(text: string, options?: SpeakOptions): Promise<void> {
  // Check cache first
  let audioBase64 = await getCachedAudio(text);

  if (!audioBase64) {
    // Fetch from ElevenLabs via edge function
    audioBase64 = await fetchClonedAudio(text);
    // Cache for next time
    await cacheAudio(text, audioBase64);
  }

  // Write to temp file for expo-audio playback
  const tempFile = new File(Paths.cache, `darevocem_speak_${Date.now()}.mp3`);
  // Convert base64 to Uint8Array and write
  const binaryString = atob(audioBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  tempFile.write(bytes);

  // Ensure audio mode is set for playback
  await setAudioModeAsync({ playsInSilentMode: true });

  // Play via expo-audio
  const player = createAudioPlayer(tempFile.uri);
  currentPlayer = player;

  return new Promise<void>((resolve) => {
    player.addListener('playbackStatusUpdate', (status) => {
      if (!status.isLoaded) return;
      // Check if playback finished (currentTime reached duration)
      if (status.didJustFinish) {
        player.remove();
        currentPlayer = null;
        // Clean up temp file (fire-and-forget)
        try { tempFile.delete(); } catch { /* ignore */ }
        options?.onDone?.();
        resolve();
      }
    });
    player.play();
  });
}

/**
 * Fetch audio from ElevenLabs via the /speak Supabase Edge Function.
 * Returns base64-encoded audio data.
 * Throws on error.
 */
async function fetchClonedAudio(text: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VOICE.speakTimeoutMs);

  try {
    // Use raw fetch instead of supabase.functions.invoke for binary response handling
    const session = (await supabase.auth.getSession()).data.session;
    const functionUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/speak`;

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text().catch(() => 'unknown error');
      throw new Error(`/speak returned ${response.status}: ${errText.slice(0, 100)}`);
    }

    // Convert binary response to base64
    const arrayBuffer = await response.arrayBuffer();
    const audioBytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < audioBytes.byteLength; i++) {
      binary += String.fromCharCode(audioBytes[i]);
    }
    return btoa(binary);
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

/**
 * System TTS fallback using expo-speech.
 */
function speakWithSystemTts(text: string, options?: SpeakOptions): Promise<void> {
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

// === Audio Cache (AsyncStorage, LRU eviction) ===

async function getCachedAudio(text: string): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(VOICE.audioCacheKey);
    if (!raw) return null;
    const entries: AudioCacheEntry[] = JSON.parse(raw);
    const match = entries.find((e) => e.text === text);
    return match?.audioBase64 ?? null;
  } catch {
    return null;
  }
}

async function cacheAudio(text: string, audioBase64: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(VOICE.audioCacheKey);
    let entries: AudioCacheEntry[] = raw ? JSON.parse(raw) : [];

    // Remove existing entry for this text (will re-add at front)
    entries = entries.filter((e) => e.text !== text);

    // Add new entry at front
    entries.unshift({ text, audioBase64, cachedAt: Date.now() });

    // Evict oldest if over limit
    if (entries.length > VOICE.maxCachedPhrases) {
      entries = entries.slice(0, VOICE.maxCachedPhrases);
    }

    await AsyncStorage.setItem(VOICE.audioCacheKey, JSON.stringify(entries));
  } catch {
    // Cache failure is non-fatal
  }
}

/** Check if system TTS is currently speaking. */
export async function isSpeaking(): Promise<boolean> {
  if (currentPlayer?.playing) return true;
  return Speech.isSpeakingAsync();
}

/** Stop any in-progress speech (both expo-audio and system TTS). */
export async function stopSpeaking(): Promise<void> {
  if (currentPlayer) {
    try {
      currentPlayer.pause();
      currentPlayer.remove();
    } catch {
      // Player may already be removed
    }
    currentPlayer = null;
  }
  await Speech.stop();
}
