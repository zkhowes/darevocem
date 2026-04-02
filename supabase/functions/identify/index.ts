// Deno runtime — Supabase Edge Function
// Accepts an image and uses Claude to identify what's in it.
// Returns a single word/short phrase for use in AAC sentence composition.
// deno-lint-ignore-file no-explicit-any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT = `You help a person with aphasia identify objects so they can add the word to their sentence.

Given an image, return a JSON object with:
- "word": a single word or very short phrase (1-2 words) that names the main subject. Use the most common, casual English word. Example: "dog" not "canine", "coffee" not "beverage".
- "description": a short natural description (3-6 words) for disambiguation. Example: "a golden retriever puppy".
- "alternatives": array of 2-3 alternative words the image could represent, in case the main word isn't what they meant.

Return ONLY valid JSON. No markdown, no explanation.`;

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    });
  }

  try {
    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing auth' }), { status: 401 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    // Parse multipart form data to get the image
    const formData = await req.formData();
    const imageFile = formData.get('image') as File | null;
    if (!imageFile) {
      return new Response(JSON.stringify({ error: 'No image provided' }), { status: 400 });
    }

    // Convert to base64 for Claude vision
    const arrayBuffer = await imageFile.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    // Determine media type
    const mediaType = imageFile.type || 'image/jpeg';

    // Call Claude with vision
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 200,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: base64,
                },
              },
              {
                type: 'text',
                text: 'What is in this image? Return JSON with word, description, and alternatives.',
              },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!claudeResponse.ok) {
      const errText = await claudeResponse.text();
      console.error('[identify] Claude error:', errText.slice(0, 200));
      return new Response(JSON.stringify({ error: 'AI analysis failed' }), { status: 502 });
    }

    const claudeData = await claudeResponse.json();
    const rawText = claudeData.content?.[0]?.text ?? '';

    // Parse JSON from Claude response
    let parsed: any;
    try {
      // Strip any markdown fences if present
      const cleaned = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('[identify] Failed to parse Claude response:', rawText.slice(0, 200));
      // Fallback: use the raw text as the word
      parsed = { word: rawText.trim().split('\n')[0].slice(0, 30), description: rawText.trim(), alternatives: [] };
    }

    return new Response(JSON.stringify(parsed), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err: any) {
    console.error('[identify] Error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
});
