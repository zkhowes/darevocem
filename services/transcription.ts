import { supabase } from './supabase';
import type { TranscriptionResult } from '../types';

declare const __DEV__: boolean;

/**
 * Send a recorded audio file to the /transcribe edge function for
 * speech-to-text + intent/descriptor extraction.
 *
 * Returns structured TranscriptionResult with intent, descriptors, and confidence.
 */
export async function transcribeAudio(fileUri: string): Promise<TranscriptionResult> {
  try {
    // Read the audio file and prepare form data
    const response = await fetch(fileUri);
    const blob = await response.blob();

    const formData = new FormData();
    // React Native FormData accepts objects with uri/type/name
    formData.append('audio', {
      uri: fileUri,
      type: 'audio/m4a',
      name: 'recording.m4a',
    } as unknown as Blob);

    // Get auth token
    const session = (await supabase.auth.getSession()).data.session;
    const functionUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/transcribe`;

    const result = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session?.access_token ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
      },
      body: formData,
    });

    if (!result.ok) {
      const errText = await result.text().catch(() => 'unknown');
      throw new Error(`/transcribe returned ${result.status}: ${errText.slice(0, 100)}`);
    }

    const data = await result.json();

    if (__DEV__) {
      console.log('[transcription] Result:', JSON.stringify(data).slice(0, 200));
    }

    return {
      intent: data.intent ?? null,
      descriptors: Array.isArray(data.descriptors) ? data.descriptors : [],
      confidence: data.confidence ?? 'low',
      rawTranscript: data.rawTranscript ?? '',
    };
  } catch (err) {
    if (__DEV__) {
      console.error('[transcription] Error:', (err as Error).message);
    }
    return {
      intent: null,
      descriptors: [],
      confidence: 'low',
      rawTranscript: '',
    };
  }
}
