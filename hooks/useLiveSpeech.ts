import { useCallback, useRef, useState } from 'react';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import type { MicDebugEntry } from '../components/shared/MicDebugOverlay';

declare const __DEV__: boolean;

interface UseLiveSpeechReturn {
  /** Whether speech recognition is currently active */
  isListening: boolean;
  /** Current partial/interim transcript */
  transcript: string;
  /** Final transcript after recognition stops */
  finalTranscript: string;
  /** Volume level from speech recognizer (-2 to 10, <0 = inaudible) */
  volume: number;
  /** Error message if recognition failed */
  error: string | null;
  /** Duration of current listening session in ms */
  durationMs: number;
  /** Start listening */
  startListening: () => Promise<void>;
  /** Stop listening */
  stopListening: () => void;
  /** Debug log entries */
  debugLog: MicDebugEntry[];
}

function addLog(
  log: React.MutableRefObject<MicDebugEntry[]>,
  setLog: React.Dispatch<React.SetStateAction<MicDebugEntry[]>>,
  event: string,
  detail?: string,
) {
  const entry: MicDebugEntry = { timestamp: Date.now(), event, detail };
  log.current = [...log.current.slice(-30), entry];
  setLog(log.current);
  if (__DEV__) {
    console.log(`[speech] ${event}${detail ? ` ${detail}` : ''}`);
  }
}

/**
 * Hook wrapping expo-speech-recognition for real-time on-device
 * speech-to-text with volume metering.
 *
 * Returns live transcript that updates as the user speaks,
 * plus volume level for visual feedback.
 */
export function useLiveSpeech(): UseLiveSpeechReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [volume, setVolume] = useState(-2);
  const [error, setError] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [debugLog, setDebugLog] = useState<MicDebugEntry[]>([]);
  const logRef = useRef<MicDebugEntry[]>([]);
  const startTimeRef = useRef<number>(0);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Wire up native events via hooks
  useSpeechRecognitionEvent('start', () => {
    setIsListening(true);
    setError(null);
    startTimeRef.current = Date.now();
    // Start duration counter
    durationIntervalRef.current = setInterval(() => {
      setDurationMs(Date.now() - startTimeRef.current);
    }, 100);
    addLog(logRef, setDebugLog, 'START');
  });

  useSpeechRecognitionEvent('result', (event) => {
    const result = event.results[0];
    if (!result) return;

    if (event.isFinal) {
      setFinalTranscript(result.transcript);
      setTranscript(result.transcript);
      addLog(logRef, setDebugLog, 'FINAL', result.transcript);
    } else {
      setTranscript(result.transcript);
      addLog(logRef, setDebugLog, 'PARTIAL', result.transcript);
    }
  });

  useSpeechRecognitionEvent('volumechange', (event) => {
    setVolume(event.value);
  });

  useSpeechRecognitionEvent('error', (event) => {
    // "no-speech" is not really an error — just means silence
    if (event.error === 'no-speech') {
      addLog(logRef, setDebugLog, 'NO_SPEECH');
    } else {
      setError(`${event.error}: ${event.message}`);
      addLog(logRef, setDebugLog, 'ERROR', `${event.error}: ${event.message}`);
    }
  });

  useSpeechRecognitionEvent('end', () => {
    setIsListening(false);
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    setDurationMs(Date.now() - startTimeRef.current);
    setVolume(-2);
    addLog(logRef, setDebugLog, 'END');
  });

  const startListening = useCallback(async () => {
    setTranscript('');
    setFinalTranscript('');
    setError(null);
    setDurationMs(0);

    // Check and request permissions
    const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) {
      const msg = 'Speech recognition permission not granted';
      setError(msg);
      addLog(logRef, setDebugLog, 'PERM_DENIED', msg);
      return;
    }

    addLog(logRef, setDebugLog, 'STARTING');

    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      continuous: true,
      // contextualStrings help the recognizer with AAC-relevant vocabulary
      contextualStrings: [
        'I need', 'I want', 'I feel', 'Please', 'Where is',
        "Don't", 'I love', 'Thank you', 'Help', 'How do I',
        'Can I', 'water', 'coffee', 'rest', 'medication',
      ],
      volumeChangeEventOptions: {
        enabled: true,
        intervalMillis: 100,
      },
      // iOS: dictation task hint for better recognition of short phrases
      iosTaskHint: 'dictation',
    });
  }, []);

  const stopListening = useCallback(() => {
    addLog(logRef, setDebugLog, 'STOPPING');
    ExpoSpeechRecognitionModule.stop();
  }, []);

  return {
    isListening,
    transcript,
    finalTranscript,
    volume,
    error,
    durationMs,
    startListening,
    stopListening,
    debugLog,
  };
}
