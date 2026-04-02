// Deno runtime — Supabase Edge Function
// Speech-to-text transcription + aphasia-aware intent/descriptor extraction.
// Uses Gemini Flash multimodal: audio → transcription + extraction in a single call.
// No API keys on device.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GOOGLE_AI_API_KEY = Deno.env.get('GOOGLE_AI_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const GEMINI_TIMEOUT_MS = 15000;
const GEMINI_MODEL = 'gemini-2.0-flash';

// Single prompt that handles both transcription and extraction in one call
const SYSTEM_PROMPT = `You transcribe and analyze speech from a person with aphasia. They repeat their sentence start when stuck on the next word, and sometimes describe what they're looking for.

Your task:
1. Transcribe the audio accurately, including repetitions and false starts.
2. From the transcript, extract:
   - **intent**: The stable sentence beginning they keep repeating (e.g., "I need"). If they say "I need I need I need", the intent is "I need". If no clear repeated start, use the most coherent phrase as the intent, or null if unintelligible.
   - **descriptors**: Words they use to describe what they want but can't name (e.g., "thing", "red", "big"). These are clues, not the final word. Extract only descriptive/hint words, not the intent itself.
   - **confidence**: "high" if the intent is repeated 2+ times clearly, "medium" if said once clearly, "low" if unclear.

Rules:
- Return ONLY valid JSON. No markdown, no explanation, no preamble.
- The intent should be a clean sentence beginning, not the full rambling transcript.
- Descriptors are hints about what comes next — adjectives, categories, associations ("it's a thing", "the red one", "has to do with school").
- If the audio is just noise or unintelligible, return {"intent": null, "descriptors": [], "confidence": "low", "rawTranscript": ""}.

JSON format: {"intent": "I need", "descriptors": ["thing", "red"], "confidence": "high", "rawTranscript": "I need I need it's a thing the red one I need"}`;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  try {
    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return jsonResponse({ error: 'Invalid auth token' }, 401);
    }

    // Parse multipart form data to get audio file
    const formData = await req.formData();
    const audioFile = formData.get('audio');

    if (!audioFile || !(audioFile instanceof File)) {
      return jsonResponse({ error: 'Missing audio file in form data' }, 400);
    }

    if (!GOOGLE_AI_API_KEY) {
      return jsonResponse({ error: 'Transcription not configured (missing GOOGLE_AI_API_KEY)' }, 500);
    }

    // Read audio file as base64 for Gemini multimodal input
    const audioBuffer = await audioFile.arrayBuffer();
    const audioBytes = new Uint8Array(audioBuffer);
    let audioBase64 = '';
    // Encode in chunks to avoid call stack issues with large files
    const CHUNK_SIZE = 8192;
    for (let i = 0; i < audioBytes.length; i += CHUNK_SIZE) {
      const chunk = audioBytes.subarray(i, Math.min(i + CHUNK_SIZE, audioBytes.length));
      audioBase64 += btoa(String.fromCharCode(...chunk));
    }

    // Determine MIME type from file name
    const fileName = audioFile.name || 'recording.m4a';
    const mimeType = fileName.endsWith('.m4a') ? 'audio/mp4'
      : fileName.endsWith('.wav') ? 'audio/wav'
      : fileName.endsWith('.mp3') ? 'audio/mpeg'
      : 'audio/mp4'; // default for iOS recordings

    // Single Gemini call: transcribe + extract in one round-trip
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GOOGLE_AI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: SYSTEM_PROMPT }],
          },
          contents: [{
            parts: [
              {
                inline_data: {
                  mime_type: mimeType,
                  data: audioBase64,
                },
              },
              {
                text: 'Transcribe this audio and extract the intent and descriptors. Return only JSON.',
              },
            ],
          }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 300,
            responseMimeType: 'application/json',
          },
        }),
        signal: controller.signal,
      },
    );

    clearTimeout(timeout);

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      console.error(`[transcribe] Gemini ${geminiResponse.status}: ${errText.slice(0, 300)}`);
      return jsonResponse({
        intent: null,
        descriptors: [],
        confidence: 'low',
        rawTranscript: '',
        error: `Gemini error: ${geminiResponse.status}`,
      });
    }

    const geminiResult = await geminiResponse.json();
    let resultText = geminiResult.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    // Strip markdown fences just in case
    resultText = resultText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

    console.log(`[transcribe] Gemini result: ${resultText.slice(0, 200)}`);

    if (!resultText) {
      return jsonResponse({
        intent: null,
        descriptors: [],
        confidence: 'low',
        rawTranscript: '',
      });
    }

    try {
      const parsed = JSON.parse(resultText);
      return jsonResponse({
        intent: parsed.intent ?? null,
        descriptors: Array.isArray(parsed.descriptors) ? parsed.descriptors : [],
        confidence: parsed.confidence ?? 'low',
        rawTranscript: parsed.rawTranscript ?? '',
      });
    } catch {
      console.error('[transcribe] Failed to parse Gemini JSON:', resultText);
      // Try to use the raw text as a transcript fallback
      return jsonResponse({
        intent: resultText.length < 100 ? resultText : null,
        descriptors: [],
        confidence: 'low',
        rawTranscript: resultText,
        error: `Parse error: ${resultText.slice(0, 100)}`,
      });
    }
  } catch (err: unknown) {
    const error = err as Error;
    const isTimeout = error.name === 'AbortError';
    console.error(`[transcribe] ${isTimeout ? 'Timeout' : error.message}`);
    return jsonResponse({
      intent: null,
      descriptors: [],
      confidence: 'low',
      rawTranscript: '',
      error: isTimeout ? 'Transcription timeout' : 'Internal error',
    }, isTimeout ? 504 : 500);
  }
});
