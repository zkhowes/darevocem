// Deno runtime — Supabase Edge Function
// Proxies to ElevenLabs TTS API. No API keys on device.
// Returns audio/mpeg binary for client-side playback.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY')!;
const ELEVENLABS_VOICE_ID = Deno.env.get('ELEVENLABS_VOICE_ID')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MODEL_ID = 'eleven_flash_v2_5';
const TIMEOUT_MS = 8000;

Deno.serve(async (req: Request) => {
  try {
    // Auth — verify user identity
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid auth token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Validate request
    const body = await req.json();
    const { text } = body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Missing or empty text' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
      console.error('[speak] Missing ElevenLabs config');
      return new Response(JSON.stringify({ error: 'TTS not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Call ElevenLabs TTS API
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY,
          'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({
          text: text.trim(),
          model_id: MODEL_ID,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true,
          },
        }),
        signal: controller.signal,
      },
    );

    clearTimeout(timeout);

    if (!response.ok) {
      const errBody = await response.text();
      console.error(`[speak] ElevenLabs ${response.status}: ${errBody.slice(0, 200)}`);
      return new Response(
        JSON.stringify({ error: `ElevenLabs error: ${response.status}` }),
        { status: 502, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Stream audio back to client
    const audioData = await response.arrayBuffer();

    return new Response(audioData, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioData.byteLength.toString(),
      },
    });
  } catch (err: unknown) {
    const error = err as Error;
    const isTimeout = error.name === 'AbortError';
    console.error(`[speak] ${isTimeout ? 'Timeout' : error.message}`);
    return new Response(
      JSON.stringify({ error: isTimeout ? 'TTS timeout' : 'Internal error' }),
      { status: isTimeout ? 504 : 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});
