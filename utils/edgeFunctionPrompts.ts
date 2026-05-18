/**
 * Pure helpers for /identify and /predict edge function prompt selection.
 * Extracted so the dispatching logic is testable with Jest. The edge
 * functions themselves run in Deno and inline equivalent logic; these
 * utils are the canonical specification.
 *
 * Covers:
 *   - selectIdentifyMode: picks the prompt + max_tokens budget given a mode
 *   - buildSuggestPhraseUserMessage: builds the user-facing message body
 *     for /predict requestType=suggest_phrase. Two shapes — home flow
 *     (timeOfDay only) vs compose flow (intent + fullPhrase context).
 */

export type IdentifyMode = 'word' | 'drawing' | 'photo';

export interface IdentifyDispatch {
  mode: IdentifyMode;
  maxTokens: number;
  systemPromptKind: 'word' | 'drawing' | 'photo';
}

/**
 * Given a mode string from the request body, return the dispatch shape used
 * by the /identify edge function. Defaults to 'photo' for unknown values
 * (the original behavior — photo is the historical default).
 */
export function selectIdentifyMode(rawMode: string | null | undefined): IdentifyDispatch {
  const mode: IdentifyMode =
    rawMode === 'word' || rawMode === 'drawing' || rawMode === 'photo'
      ? rawMode
      : 'photo';
  return {
    mode,
    // Word mode produces a single short string — keep the token budget tight
    // to shave latency. Drawing/photo return three fields and need more.
    maxTokens: mode === 'word' ? 30 : 200,
    systemPromptKind: mode,
  };
}

export interface SuggestPhraseInput {
  captured: string;
  intent?: string;
  fullPhrase?: string;
  timeOfDay?: string;
}

/**
 * Build the user message body for /predict requestType=suggest_phrase.
 * Compose context wins when both intent and fullPhrase are present;
 * otherwise falls back to the home (timeOfDay) shape. Always includes the
 * captured text — caller should reject empty captured before calling.
 */
export function buildSuggestPhraseUserMessage(input: SuggestPhraseInput): string {
  const captured = input.captured.trim();
  const intent = (input.intent ?? '').trim();
  const fullPhrase = (input.fullPhrase ?? '').trim();

  if (intent || fullPhrase) {
    return `Compose context.
Captured input: "${captured}"
Current intent: ${intent || '(none)'}
Partial phrase so far: "${fullPhrase || intent || captured}"

Return ONE short continuation (2-6 words) that slots in right after the partial phrase and incorporates the captured input.`;
  }

  return `Home context.
Captured input: "${captured}"
Time of day: ${input.timeOfDay ?? 'morning'}

Return ONE complete sentence appropriate for the time of day that incorporates the captured input.`;
}
