// Deno runtime — Supabase Edge Function
// Proxies to Claude API for next-word predictions. No Anthropic key on device.
// deno-lint-ignore-file no-explicit-any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MODEL = 'claude-haiku-4-5-20251001';

// Single, focused system prompt. The key insight: Claude sees the FULL sentence
// being built, not a fragmented intent + slots. It just needs to predict what
// word(s) come next.
const SYSTEM_PROMPT = `You help a person with aphasia complete sentences. They can start sentences but get stuck finding the next word. You predict what comes next.

Rules:
- Return ONLY valid JSON. No markdown, no explanation, no preamble.
- Predict 5 next words or short phrases (1-3 words each) that naturally continue the sentence.
- Rank by likelihood — most probable first.
- Each prediction should be a DIFFERENT direction the sentence could go. Don't cluster synonyms.
- NEVER repeat any word already in the sentence.
- Predictions must be grammatically correct continuations.
- Be warm, practical, conversational. This is casual speech, not formal writing.
- If the sentence feels complete, suggest ending words: "please", "now", "today", or return fewer predictions.

JSON format: {"predictions": [{"text": "coffee"}, {"text": "water"}, {"text": "help"}, {"text": "rest"}, {"text": "to go outside"}]}`;

const REFINE_SYSTEM_PROMPT = `You help a person with aphasia complete sentences. They saw a word suggestion and indicated it's close but not what they want. You suggest alternatives in the same semantic neighborhood.

Rules:
- Return ONLY valid JSON. No markdown, no explanation, no preamble.
- Suggest 5 alternatives that are RELATED to the rejected word but DIFFERENT.
- Example: rejected "coffee" → suggest "tea", "espresso", "hot chocolate", "juice", "a warm drink"
- Example: rejected "tired" → suggest "exhausted", "sleepy", "drained", "worn out", "fatigued"
- Do NOT repeat the rejected word, any already-rejected words, or any words already visible on screen.
- Predictions must be grammatically correct continuations of the sentence.

JSON format: {"predictions": [{"text": "tea"}, {"text": "espresso"}, {"text": "hot chocolate"}]}`;

const COMMON_PHRASES_PROMPT = `You generate common phrases a person with aphasia might want to say at a given time of day. These should be complete, natural sentences — the kind of things someone says regularly in daily life.

Rules:
- Return ONLY valid JSON. No markdown, no explanation, no preamble.
- 5-8 phrases ranked by likelihood for the given time of day.
- Phrases should be complete sentences (e.g., "I need coffee and cream", "What's for dinner tonight").
- Be warm, direct, practical. Casual speech.

JSON format: {"phrases": [{"text": "I need coffee and cream"}, {"text": "What time is my appointment"}]}`;

async function callClaude(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
  temperature: number,
  timeoutMs: number,
): Promise<{ text: string; latencyMs: number } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startMs = Date.now();

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        temperature,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const latencyMs = Date.now() - startMs;

    if (!response.ok) {
      console.error(`[predict] Claude returned ${response.status}: ${await response.text()}`);
      return null;
    }

    const result = await response.json();
    const text = result.content?.[0]?.text ?? '';
    return { text, latencyMs };
  } catch (err: any) {
    clearTimeout(timeout);
    const latencyMs = Date.now() - startMs;
    if (err.name === 'AbortError') {
      console.error(`[predict] Claude timed out after ${latencyMs}ms (budget: ${timeoutMs}ms)`);
    } else {
      console.error(`[predict] Claude error after ${latencyMs}ms:`, err.message);
    }
    return null;
  }
}

function jsonResponse(body: any, status = 200): Response {
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
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const body = await req.json();
    const { requestType, fullPhrase, targetItem, timeOfDay } = body;

    // === Common phrases ===
    if (requestType === 'common_phrases') {
      // Fetch user patterns in parallel with nothing — keep it simple for now
      const userMessage = `Time of day: ${timeOfDay ?? 'morning'}
Day of week: ${new Date().toLocaleDateString('en-US', { weekday: 'long' })}

Generate 5-8 complete phrases this person is most likely to want to say right now.`;

      const result = await callClaude(COMMON_PHRASES_PROMPT, userMessage, 300, 0.7, 4000);
      if (!result) {
        return jsonResponse({ phrases: [], fallback: true });
      }

      try {
        const parsed = JSON.parse(result.text);
        return jsonResponse({
          phrases: parsed.phrases ?? [],
          fallback: false,
          debug: { promptSent: userMessage, rawResponse: result.text, latencyMs: result.latencyMs, source: 'claude' },
        });
      } catch {
        console.error('[predict] Failed to parse common phrases JSON:', result.text);
        return jsonResponse({ phrases: [], fallback: true });
      }
    }

    // === Refine (swipe-left on a specific item) ===
    if (requestType === 'refine') {
      const { otherVisibleOptions, triedItems } = body;
      const avoidList = [
        targetItem,
        ...(triedItems ?? []),
        ...(otherVisibleOptions ?? []),
      ];

      const userMessage = `Sentence so far: "${fullPhrase ?? ''}"
The user rejected: "${targetItem}"
Also avoid these (already on screen or previously rejected): ${avoidList.join(', ')}

Suggest 5 alternatives related to "${targetItem}" that naturally continue this sentence.`;

      const result = await callClaude(REFINE_SYSTEM_PROMPT, userMessage, 200, 0.8, 4000);
      if (!result) {
        return jsonResponse({ predictions: [], fallback: true });
      }

      try {
        const parsed = JSON.parse(result.text);
        return jsonResponse({
          predictions: parsed.predictions ?? [],
          fallback: false,
          debug: { promptSent: userMessage, rawResponse: result.text, latencyMs: result.latencyMs, source: 'claude' },
        });
      } catch {
        console.error('[predict] Failed to parse refine JSON:', result.text);
        return jsonResponse({ predictions: [], fallback: true });
      }
    }

    // === Modifiers ===
    if (requestType === 'modifiers') {
      const userMessage = `For the word "${targetItem}" in the sentence "${fullPhrase}", suggest 4-6 modifier/connector words ranked by probability (e.g., "and", "or", "with", "but").

Return ONLY valid JSON: {"modifiers": ["and", "or", "with"]}`;

      const result = await callClaude(SYSTEM_PROMPT, userMessage, 100, 0.5, 4000);
      if (!result) {
        return jsonResponse({ modifiers: [] });
      }

      try {
        const parsed = JSON.parse(result.text);
        return jsonResponse({ modifiers: parsed.modifiers ?? [] });
      } catch {
        return jsonResponse({ modifiers: [] });
      }
    }

    // === Next word prediction (default) ===
    const { triedItems } = body;

    // Fetch user's recent selections for this time of day (non-blocking if slow)
    let topSelections: string[] = [];
    try {
      const { data: patterns } = await supabase
        .from('usage_events')
        .select('item_text')
        .eq('user_id', user.id)
        .eq('event_type', 'select')
        .eq('time_of_day', timeOfDay ?? 'morning')
        .order('created_at', { ascending: false })
        .limit(10);

      topSelections = (patterns ?? [])
        .map((p: { item_text: string | null }) => p.item_text)
        .filter(Boolean) as string[];
    } catch {
      // DB query failed — proceed without patterns
    }

    const avoidStr = triedItems && triedItems.length > 0
      ? `\nDo NOT suggest these (already rejected): ${triedItems.join(', ')}`
      : '';

    const patternsStr = topSelections.length > 0
      ? `\nUser's frequently selected words at this time of day: ${topSelections.join(', ')}`
      : '';

    const userMessage = `Sentence so far: "${fullPhrase}"

What word or short phrase comes next?${patternsStr}${avoidStr}`;

    const result = await callClaude(SYSTEM_PROMPT, userMessage, 200, 0.7, 4000);
    if (!result) {
      return jsonResponse({ predictions: [], fallback: true });
    }

    try {
      const parsed = JSON.parse(result.text);
      return jsonResponse({
        predictions: parsed.predictions ?? [],
        fallback: false,
        debug: { promptSent: userMessage, rawResponse: result.text, latencyMs: result.latencyMs, source: 'claude' },
      });
    } catch {
      console.error('[predict] Failed to parse prediction JSON:', result.text);
      return jsonResponse({ predictions: [], fallback: true });
    }
  } catch (err: any) {
    console.error('[predict] Unhandled error:', err.message);
    return jsonResponse({ predictions: [], fallback: true });
  }
});
