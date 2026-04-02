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
- Each prediction must represent a DIFFERENT logical path the sentence could take:
  P1, P2: high-probability completions (may be in the same category).
  P3, P4, P5: significantly different directions — vary the part of speech, semantic category, or sentence structure. Example: if P1 is a noun ("coffee"), P3 could be a verb ("go"), P4 an adjective ("comfortable"), P5 a phrase ("to talk to someone").
- NEVER repeat any word already in the sentence.
- Predictions must be grammatically correct continuations.
- Be warm, practical, conversational. This is casual speech, not formal writing.
- If the sentence feels complete, suggest ending words: "please", "now", "today", or return fewer predictions.

For each prediction, include a "wordType" field with one of: "verb", "noun", "descriptor", "person", "question", "negation", "social", "misc".
- verb: actions (go, want, eat, help)
- noun: things (water, coffee, phone, bathroom)
- descriptor: adjectives (tired, cold, happy, more)
- person: people (you, someone, my daughter)
- question: question words (what, where, when)
- negation: negative (no, don't, stop, never)
- social: social words (please, thank you, hello)
- misc: everything else (and, the, but, now)

JSON format: {"predictions": [{"text": "coffee", "wordType": "noun"}, {"text": "to go", "wordType": "verb"}, {"text": "help", "wordType": "verb"}, {"text": "tired", "wordType": "descriptor"}, {"text": "someone", "wordType": "person"}]}`;

const REFINE_SYSTEM_PROMPT = `You help a person with aphasia complete sentences. They saw a word suggestion and indicated it's close but not what they want. You suggest alternatives in the same semantic neighborhood.

Rules:
- Return ONLY valid JSON. No markdown, no explanation, no preamble.
- Suggest 5 alternatives that are RELATED to the rejected word but DIFFERENT.
- Example: rejected "coffee" → suggest "tea", "espresso", "hot chocolate", "juice", "a warm drink"
- Example: rejected "tired" → suggest "exhausted", "sleepy", "drained", "worn out", "fatigued"
- Do NOT repeat the rejected word, any already-rejected words, or any words already visible on screen.
- Predictions must be grammatically correct continuations of the sentence.

For each prediction, include a "wordType" field: "verb", "noun", "descriptor", "person", "question", "negation", "social", or "misc".

JSON format: {"predictions": [{"text": "tea", "wordType": "noun"}, {"text": "espresso", "wordType": "noun"}, {"text": "hot chocolate", "wordType": "noun"}]}`;

const COMMON_PHRASES_PROMPT = `You generate common phrases a person with aphasia might want to say at a given time of day. These should be complete, natural sentences — the kind of things someone says regularly in daily life.

Rules:
- Return ONLY valid JSON. No markdown, no explanation, no preamble.
- 5-8 phrases ranked by likelihood for the given time of day.
- Phrases should be complete sentences (e.g., "I need coffee and cream", "What's for dinner tonight").
- Be warm, direct, practical. Casual speech.

JSON format: {"phrases": [{"text": "I need coffee and cream"}, {"text": "What time is my appointment"}]}`;

interface ClaudeResult {
  text: string;
  latencyMs: number;
  error?: string;
}

async function callClaude(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
  temperature: number,
  timeoutMs: number,
): Promise<ClaudeResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startMs = Date.now();

  // Check API key is present
  if (!ANTHROPIC_API_KEY) {
    clearTimeout(timeout);
    return { text: '', latencyMs: 0, error: 'ANTHROPIC_API_KEY not set' };
  }

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
      const errBody = await response.text();
      const errMsg = `Claude ${response.status}: ${errBody.slice(0, 200)}`;
      console.error(`[predict] ${errMsg}`);
      return { text: '', latencyMs, error: errMsg };
    }

    const result = await response.json();
    let text = result.content?.[0]?.text ?? '';
    // Claude sometimes wraps JSON in markdown fences despite instructions
    text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    return { text, latencyMs };
  } catch (err: any) {
    clearTimeout(timeout);
    const latencyMs = Date.now() - startMs;
    const errMsg = err.name === 'AbortError'
      ? `Timeout after ${latencyMs}ms (budget: ${timeoutMs}ms)`
      : `${err.name}: ${err.message}`;
    console.error(`[predict] ${errMsg}`);
    return { text: '', latencyMs, error: errMsg };
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
    // Auth — verify user identity. If auth fails, we still serve predictions
    // (they're read-only AI calls) but skip user-specific pattern lookups.
    const authHeader = req.headers.get('Authorization');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    let userId: string | null = null;

    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError) {
        console.error('[predict] Auth warning:', authError.message);
        // Don't return 401 — continue without user context
      } else if (user) {
        userId = user.id;
      }
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
      if (result.error) {
        return jsonResponse({ phrases: [], fallback: true, claudeError: result.error });
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
        return jsonResponse({ phrases: [], fallback: true, claudeError: `JSON parse failed: ${result.text?.slice(0, 100) || '(empty)'}` });
      }
    }

    // === Intent alternative (swipe-left on intent to cycle) ===
    if (requestType === 'intent_alternative') {
      const userMessage = `The user started their sentence with: "${fullPhrase}"
They want a different way to start. They've already tried: ${(body.triedItems ?? []).join(', ') || 'nothing yet'}

Suggest ONE alternative sentence starter (2-4 words) that expresses a similar or different need.
Examples of sentence starters: "I need", "I want", "Can you", "Please help me", "How do I", "Where is", "Tell me about", "I feel"

Return ONLY valid JSON: {"intent": "I want"}`;

      const result = await callClaude(SYSTEM_PROMPT, userMessage, 100, 0.8, 4000);
      if (result.error) {
        return jsonResponse({ intent: null, claudeError: result.error });
      }

      try {
        const parsed = JSON.parse(result.text);
        return jsonResponse({
          intent: parsed.intent ?? null,
          debug: { promptSent: userMessage, rawResponse: result.text, latencyMs: result.latencyMs, source: 'claude' },
        });
      } catch {
        console.error('[predict] Failed to parse intent_alternative JSON:', result.text);
        return jsonResponse({ intent: null, claudeError: `JSON parse failed: ${result.text?.slice(0, 100) || '(empty)'}` });
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

      const result = await callClaude(REFINE_SYSTEM_PROMPT, userMessage, 400, 0.8, 4000);
      if (result.error) {
        return jsonResponse({ predictions: [], fallback: true, claudeError: result.error });
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
        return jsonResponse({ predictions: [], fallback: true, claudeError: `JSON parse failed: ${result.text?.slice(0, 100) || '(empty)'}` });
      }
    }

    // === Voice hint (descriptor-based reranking from voice input) ===
    if (requestType === 'voice_hint') {
      const { voiceDescriptor, currentPredictions } = body;
      const currentList = (currentPredictions ?? []).join(', ');

      const userMessage = `Sentence so far: "${fullPhrase ?? ''}"
The user described what they're looking for as: "${voiceDescriptor}"
Current predictions on screen: ${currentList || 'none'}

Rerank and suggest 5 predictions that incorporate this hint.
The descriptor word "${voiceDescriptor}" or the closest concrete match should be the FIRST prediction.
The remaining predictions should be related to the hint while still being natural continuations of the sentence.`;

      const result = await callClaude(SYSTEM_PROMPT, userMessage, 400, 0.7, 4000);
      if (result.error) {
        return jsonResponse({ predictions: [], fallback: true, claudeError: result.error });
      }

      try {
        const parsed = JSON.parse(result.text);
        return jsonResponse({
          predictions: parsed.predictions ?? [],
          fallback: false,
          debug: { promptSent: userMessage, rawResponse: result.text, latencyMs: result.latencyMs, source: 'claude' },
        });
      } catch {
        console.error('[predict] Failed to parse voice_hint JSON:', result.text);
        return jsonResponse({ predictions: [], fallback: true, claudeError: `JSON parse failed: ${result.text?.slice(0, 100) || '(empty)'}` });
      }
    }

    // === Modifiers ===
    if (requestType === 'modifiers') {
      const userMessage = `For the word "${targetItem}" in the sentence "${fullPhrase}", suggest 4-6 modifier/connector words ranked by probability (e.g., "and", "or", "with", "but").

Return ONLY valid JSON: {"modifiers": ["and", "or", "with"]}`;

      const result = await callClaude(SYSTEM_PROMPT, userMessage, 100, 0.5, 4000);
      if (result.error) {
        return jsonResponse({ modifiers: [], claudeError: result.error });
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

    // Fetch user's recent selections for this time of day (skip if no auth)
    let topSelections: string[] = [];
    if (userId) {
      try {
        const { data: patterns } = await supabase
          .from('usage_events')
          .select('item_text')
          .eq('user_id', userId)
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
    }

    const avoidStr = triedItems && triedItems.length > 0
      ? `\nDo NOT suggest these (already rejected): ${triedItems.join(', ')}`
      : '';

    const patternsStr = topSelections.length > 0
      ? `\nUser's frequently selected words at this time of day: ${topSelections.join(', ')}`
      : '';

    const userMessage = `Sentence so far: "${fullPhrase}"

What word or short phrase comes next?${patternsStr}${avoidStr}`;

    const result = await callClaude(SYSTEM_PROMPT, userMessage, 400, 0.7, 4000);
    if (result.error) {
      return jsonResponse({ predictions: [], fallback: true, claudeError: result.error });
    }

    try {
      const parsed = JSON.parse(result.text);
      return jsonResponse({
        predictions: parsed.predictions ?? [],
        fallback: false,
        debug: { promptSent: userMessage, rawResponse: result.text, latencyMs: result.latencyMs, source: 'claude' },
      });
    } catch (parseErr: any) {
      console.error('[predict] Failed to parse prediction JSON:', result.text);
      return jsonResponse({ predictions: [], fallback: true, claudeError: `JSON parse failed: ${result.text?.slice(0, 100) || '(empty)'}` });
    }
  } catch (err: any) {
    console.error('[predict] Unhandled error:', err.message);
    return jsonResponse({ predictions: [], fallback: true, claudeError: `Unhandled: ${err.message}` });
  }
});
