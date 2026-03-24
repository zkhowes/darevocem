// Deno runtime — Supabase Edge Function
// Proxies to Claude API for next-slot predictions. No Anthropic key on device.
// deno-lint-ignore-file no-explicit-any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface PatternRow {
  item_text: string | null;
  event_type: string;
}

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const SYSTEM_PROMPT = `You predict the next word or phrase in a sentence being composed by a person with aphasia. They select an intent, then you predict what comes next for each slot.

Rules:
- Return ONLY valid JSON. No markdown, no explanation.
- 3-5 predictions ranked by likelihood.
- Predictions: 1-4 words. Use natural phrases ("coffee and cream") not just single words when a phrase is more natural.
- Consider the intent type for filtering.
- Be warm, direct, practical. Casual speech.
- Weight the user's personal patterns heavily — their history matters more than general language probability.

JSON format:
{"predictions": [{"text": "water", "type": "object"}, {"text": "help", "type": "object"}]}`;

Deno.serve(async (req: Request) => {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const body = await req.json();
    const { intent, currentPhrase, currentSlot, sessionContext } = body;
    const { requestType, targetItem, triedPaths } = body;

    // 2-second budget — if Claude is slow, fall back to curated defaults on the client
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    // Modifier requests are lightweight — bypass the pattern lookup and main prediction flow
    if (requestType === 'modifiers') {
      const modifierMessage = `For the word "${targetItem}" in the context of "${intent} ${currentPhrase.join(' ')}", suggest 4-6 modifier/connector words ranked by probability (e.g., "and", "or", "with", "but").

Return ONLY valid JSON: {"modifiers": ["and", "or", "with"]}`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 100,
          temperature: 0.5,
          messages: [{ role: 'user', content: modifierMessage }],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      if (!response.ok) {
        return new Response(JSON.stringify({ modifiers: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      const result = await response.json();
      const content = result.content?.[0]?.text ?? '{"modifiers": []}';
      const parsed = JSON.parse(content);
      return new Response(JSON.stringify({ modifiers: parsed.modifiers ?? [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // Pull user's recent selections for this intent + time of day to weight predictions
    const { data: patterns } = await supabase
      .from('usage_events')
      .select('item_text, event_type')
      .eq('user_id', user.id)
      .eq('intent', intent)
      .eq('time_of_day', sessionContext.timeOfDay)
      .eq('event_type', 'select')
      .order('created_at', { ascending: false })
      .limit(20);

    const topSelections = patterns
      ?.map((p: PatternRow) => p.item_text)
      .filter(Boolean)
      .slice(0, 5) ?? [];

    // When Amanda has exhausted her history and backed all the way up, triedPaths
    // tells Claude which directions she already rejected so it suggests genuinely new options.
    const triedPathsStr = triedPaths && triedPaths.length > 0
      ? `\n- Paths already tried and rejected: ${triedPaths.map((p: string[]) => p.join(' → ')).join('; ')}`
      : '';

    const userMessage = `Intent: "${intent}"
Phrase so far: "${currentPhrase.join(' ')}"
Predict the next ${currentSlot}.

User patterns:
- Time of day: ${sessionContext.timeOfDay}
- Top selections for "${intent}" at this time: ${topSelections.join(', ') || 'none yet'}
- Recent session selections: ${sessionContext.recentSelections?.join(', ') || 'none'}
- Recently rejected: ${sessionContext.recentRejections?.join(', ') || 'none'}${triedPathsStr}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        temperature: 0.7,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return new Response(JSON.stringify({ predictions: [], fallback: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await response.json();
    const content = result.content?.[0]?.text ?? '{"predictions": []}';
    const parsed = JSON.parse(content);

    return new Response(JSON.stringify({
      predictions: parsed.predictions ?? [],
      fallback: false,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (_error: any) {
    // Timeout, parse error, or any upstream failure — client will use curated fallbacks
    return new Response(JSON.stringify({ predictions: [], fallback: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
