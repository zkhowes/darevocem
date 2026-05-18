// Deno runtime — Supabase Edge Function
// Accepts an image and uses Claude to identify what's in it.
// Returns a single word/short phrase for use in AAC sentence composition.
// deno-lint-ignore-file no-explicit-any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT = `You help a person with aphasia turn a photo into a piece of sentence they can speak.

You will receive an image, and optionally the intent they have already chosen and the partial phrase they have already composed. Use that context to predict what naturally comes next.

Return a JSON object with:
- "literal": a 1-2 word casual English name for the main subject. Example: "dog", "coffee", "glass of water". Use the most common everyday word.
- "contextual": a short phrase (2-6 words) that would naturally complete the user's sentence given the intent and partial phrase. It should slot in right after the partial phrase. Example: intent "I want", phrase "I want" + dog photo -> "to pet the dog". Intent "I need", phrase "I need" + water photo -> "a glass of water". If there is no intent or phrase, return a generic completion like "a dog" or "some coffee".
- "alternatives": 1-2 alternative short phrases the user might have meant, in case the main interpretations are wrong.

Both "literal" and "contextual" must be grammatically continuable from the partial phrase. Do not repeat words already in the phrase.

Return ONLY valid JSON. No markdown, no explanation.`;

// Drawing mode: the image is a finger-drawn sketch from the handwriting canvas,
// not a photo. We need Claude to read it as a pictogram for an AAC user, not
// describe the artwork.
const DRAWING_PROMPT = `You help a person with aphasia turn a hand-drawn sketch into a word or phrase they can speak.

The image is NOT a photo — it is a quick finger sketch drawn on a phone screen. It may be rough, partial, or stylized. Treat it as a pictogram: identify the CONCEPT the user is most likely trying to convey, not the artistic quality.

Use the optional intent and partial phrase as context for disambiguation. A circle with petals + intent "I want" almost certainly means "flowers", not "a circle".

Return a JSON object with:
- "literal": a 1-2 word casual English name for what the user drew. Example: "flower", "house", "dog", "heart".
- "contextual": a short phrase (2-6 words) that would naturally complete the user's sentence given intent and partial phrase. If no intent, return a generic completion like "some flowers".
- "alternatives": 1-2 alternative interpretations in case you guessed wrong.

If the sketch is genuinely unreadable, return literal "something" with your best guesses in alternatives.

Return ONLY valid JSON. No markdown, no explanation.`;

// Word mode: read a whole handwritten word from the canvas. The user writes
// "hello" or "Amanda" or "flower" in a single pass; we identify it in one
// shot. Claude vision is much more reliable on multi-letter input than on
// isolated characters (which is why VisionKit's single-char recognizer
// returns empty for finger-drawn glyphs).
const WORD_PROMPT = `The image contains a handwritten word drawn by hand on a phone screen with a finger. Identify the word.

Return ONLY valid JSON: {"word": "hello"}
- Read what's actually drawn. Don't autocorrect to a different word.
- Lowercase unless the writing clearly indicates a capitalized name (proper noun).
- Punctuation and digits are fine if present.
- If the writing is completely unreadable, return {"word": ""}.
- If there are multiple words separated by a space, join with a single space: {"word": "good morning"}.`;

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

    // Parse multipart form data to get the image + optional context
    const formData = await req.formData();
    const imageFile = formData.get('image') as File | null;
    if (!imageFile) {
      return new Response(JSON.stringify({ error: 'No image provided' }), { status: 400 });
    }

    const intent = (formData.get('intent') as string | null) ?? '';
    const fullPhrase = (formData.get('fullPhrase') as string | null) ?? '';
    // mode: 'photo' (default — existing behavior), 'drawing' (sketch
    // interpretation for hand-drawn pictograms), 'word' (whole handwritten
    // word from the canvas — single Claude call instead of per-letter).
    const mode = ((formData.get('mode') as string | null) ?? 'photo') as 'photo' | 'drawing' | 'word';

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

    // Select prompt + user message based on mode. Word mode has no context to send.
    let systemPrompt: string;
    let userText: string;
    if (mode === 'word') {
      systemPrompt = WORD_PROMPT;
      userText = 'Identify the handwritten word in this image. Return JSON with "word".';
    } else if (mode === 'drawing') {
      systemPrompt = DRAWING_PROMPT;
      userText = `Intent: ${intent || '(none)'}\nPartial phrase so far: ${fullPhrase || '(none)'}\n\nReturn JSON with literal, contextual, and alternatives.`;
    } else {
      systemPrompt = SYSTEM_PROMPT;
      userText = `Intent: ${intent || '(none)'}\nPartial phrase so far: ${fullPhrase || '(none)'}\n\nReturn JSON with literal, contextual, and alternatives.`;
    }

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
        // Word mode is usually a single short word, so keep token budget low.
        max_tokens: mode === 'word' ? 30 : 200,
        system: systemPrompt,
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
                text: userText,
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

    // Parse JSON from Claude response. Shape depends on mode:
    // - word: { word: string }
    // - photo/drawing: { literal, contextual, alternatives }
    //
    // Logic mirrors utils/parseClaudeJson.ts (which has Jest coverage).
    // Edge function inlines a copy because Deno can't import the util.
    let parsed: any;
    try {
      const cleaned = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      // Match the first {...} block in the cleaned text. Handles trailing
      // text after the JSON as well as preamble before it.
      const jsonMatch = cleaned.match(/\{[\s\S]*?\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
      // When JSON parses successfully but doesn't have the expected fields,
      // return empty rather than salvaging from the raw text (which would
      // pull JSON noise like 'other' from {"other":"stuff"} responses).
      if (mode === 'word' && typeof parsed?.word !== 'string') {
        parsed = { word: '' };
      }
    } catch {
      console.error('[identify] Failed to parse Claude response:', rawText.slice(0, 200));
      if (mode === 'word') {
        // Salvage strips fence+lang-tag, JSON syntax chars, and the literal
        // tokens 'json'/'word' so a malformed fenced response doesn't
        // surface the format-keyword as the recognized word.
        const stripped = rawText
          .replace(/```(?:json|javascript|js)?/gi, '')
          .replace(/[{}"\\]/g, '')
          .replace(/\bword\b/gi, '')
          .replace(/\bjson\b/gi, '')
          .replace(/[:,]/g, ' ');
        const match = stripped.match(/[a-zA-Z][a-zA-Z\s]*/);
        parsed = { word: match ? match[0].trim().toLowerCase() : '' };
      } else {
        const fallback = rawText.trim().split('\n')[0].slice(0, 40);
        parsed = { literal: fallback, contextual: fallback, alternatives: [] };
      }
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
