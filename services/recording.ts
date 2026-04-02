import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  RecordingPresets,
} from 'expo-audio';
import type { AudioRecorder, RecordingStatus } from 'expo-audio';
import AudioModule from 'expo-audio/build/AudioModule';
import { RECORDING } from '../constants/config';

declare const __DEV__: boolean;

type RecordingState = 'idle' | 'recording' | 'processing';

interface RecordingCallbacks {
  /** Called when silence is detected and recording auto-stops */
  onSilenceStop: (fileUri: string) => void;
  /** Called when max recording duration is reached */
  onMaxDuration: (fileUri: string) => void;
  /** Called on any recording error */
  onError: (error: Error) => void;
  /** Called when recording state changes */
  onStateChange?: (state: RecordingState) => void;
  /** Called with metering level for visual indicators (-160 to 0 dB) */
  onMeteringUpdate?: (db: number) => void;
}

let recorder: AudioRecorder | null = null;
let silenceTimer: ReturnType<typeof setTimeout> | null = null;
let maxDurationTimer: ReturnType<typeof setTimeout> | null = null;
let meteringInterval: ReturnType<typeof setInterval> | null = null;
let currentCallbacks: RecordingCallbacks | null = null;
let recordingState: RecordingState = 'idle';

function setState(state: RecordingState) {
  recordingState = state;
  currentCallbacks?.onStateChange?.(state);
}

/**
 * Start audio recording with silence detection.
 * Auto-stops after silenceTimeoutMs of silence or maxRecordingMs total.
 */
export async function startRecording(callbacks: RecordingCallbacks): Promise<void> {
  // Clean up any existing recording
  await cleanupRecording();
  currentCallbacks = callbacks;

  // Request permissions
  const { granted } = await requestRecordingPermissionsAsync();
  if (!granted) {
    callbacks.onError(new Error('Microphone permission not granted'));
    return;
  }

  // Configure audio mode for recording
  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
  });

  try {
    // Create recorder with metering enabled
    const rec = new AudioModule.AudioRecorder({
      ...RecordingPresets.HIGH_QUALITY,
      isMeteringEnabled: true,
    });

    // Listen for recording status events (errors, completion)
    rec.addListener('recordingStatusUpdate', (status: RecordingStatus) => {
      if (status.hasError) {
        if (__DEV__) {
          console.error('[recording] Recording error:', status.error);
        }
        cleanupRecording();
        currentCallbacks?.onError(new Error(status.error ?? 'Recording error'));
      }
    });

    await rec.prepareToRecordAsync();
    rec.record();
    recorder = rec;
    setState('recording');

    if (__DEV__) {
      console.log('[recording] Started');
    }

    // Max duration safety timer
    maxDurationTimer = setTimeout(async () => {
      if (__DEV__) {
        console.log('[recording] Max duration reached');
      }
      const uri = await stopAndGetUri();
      if (uri) currentCallbacks?.onMaxDuration(uri);
    }, RECORDING.maxRecordingMs);

    // Start silence detection via polling metering
    resetSilenceTimer();
    startMeteringPolling();
  } catch (err) {
    callbacks.onError(err as Error);
  }
}

/**
 * Manually stop recording and return the file URI.
 */
export async function stopRecording(): Promise<string | null> {
  return stopAndGetUri();
}

/**
 * Get current recording state.
 */
export function getRecordingState(): RecordingState {
  return recordingState;
}

/**
 * Clean up all recording resources.
 */
export async function cleanupRecording(): Promise<void> {
  clearTimers();
  stopMeteringPolling();
  if (recorder) {
    try {
      if (recorder.isRecording) {
        await recorder.stop();
      }
    } catch {
      // Recorder may already be stopped
    }
    recorder = null;
  }
  // Restore audio mode for playback
  await setAudioModeAsync({
    allowsRecording: false,
    playsInSilentMode: true,
  }).catch(() => {});
  setState('idle');
  currentCallbacks = null;
}

// --- Internal helpers ---

function startMeteringPolling(): void {
  // Poll metering every 100ms for silence detection and visual feedback
  meteringInterval = setInterval(() => {
    if (!recorder?.isRecording) return;

    const state = recorder.getStatus();
    const db = state.metering ?? -160;
    currentCallbacks?.onMeteringUpdate?.(db);

    // If audio is above silence threshold, reset the silence timer
    if (db > RECORDING.silenceThresholdDb) {
      resetSilenceTimer();
    }
  }, 100);
}

function stopMeteringPolling(): void {
  if (meteringInterval) {
    clearInterval(meteringInterval);
    meteringInterval = null;
  }
}

function resetSilenceTimer(): void {
  if (silenceTimer) clearTimeout(silenceTimer);
  silenceTimer = setTimeout(async () => {
    if (__DEV__) {
      console.log('[recording] Silence detected, auto-stopping');
    }
    const uri = await stopAndGetUri();
    if (uri) currentCallbacks?.onSilenceStop(uri);
  }, RECORDING.silenceTimeoutMs);
}

async function stopAndGetUri(): Promise<string | null> {
  clearTimers();
  stopMeteringPolling();
  if (!recorder) return null;

  try {
    setState('processing');

    const state = recorder.getStatus();

    // Check minimum duration
    if (state.durationMillis < RECORDING.minRecordingMs) {
      if (__DEV__) {
        console.log('[recording] Too short, discarding');
      }
      await cleanupRecording();
      return null;
    }

    await recorder.stop();
    const uri = recorder.uri;
    recorder = null;

    // Restore audio mode for playback
    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
    }).catch(() => {});

    if (__DEV__) {
      console.log('[recording] Stopped, file:', uri);
    }

    return uri;
  } catch (err) {
    if (__DEV__) {
      console.error('[recording] Stop error:', (err as Error).message);
    }
    await cleanupRecording();
    return null;
  }
}

function clearTimers(): void {
  if (silenceTimer) {
    clearTimeout(silenceTimer);
    silenceTimer = null;
  }
  if (maxDurationTimer) {
    clearTimeout(maxDurationTimer);
    maxDurationTimer = null;
  }
}
