/**
 * Robust parser for Claude JSON responses used by supabase/functions/identify.
 *
 * Claude is asked to return only JSON, but in practice it occasionally:
 *   - Wraps the response in ```json ... ``` markdown fences.
 *   - Prepends preamble ("Here is the word: ...") before the JSON.
 *   - Adds trailing commentary after the JSON.
 *   - Returns malformed text when its confidence is low.
 *
 * We handle all four shapes:
 *   1. Strip markdown fences (handled by the inner regex).
 *   2. Find the first {...} block and parse THAT, ignoring surrounding text.
 *   3. If parsing fails entirely, fall back to a mode-specific salvage that
 *      strips JSON-keyword noise and extracts the first plausible word.
 *
 * Extracted from supabase/functions/identify/index.ts so it's testable with
 * Jest. The edge function runs in Deno; this util runs in both via plain
 * string operations.
 */

export type ClaudeIdentifyMode = 'word' | 'drawing' | 'photo';

export interface WordParseResult {
  word: string;
}

export interface DrawingParseResult {
  literal: string;
  contextual: string;
  alternatives: string[];
}

export type ParseResult = WordParseResult | DrawingParseResult;

/**
 * Salvage just the first word-like character run from a malformed response.
 * Strips fences, braces, quotes, and known JSON-format keywords ('word',
 * 'json') so the leading 'json' from a fenced response doesn't end up as
 * the recognized word.
 */
export function salvageWord(rawText: string): string {
  const stripped = rawText
    // Strip ``` followed by an OPTIONAL language tag word. The previous
    // `[a-z]*` was greedy: ```hello``` parsed as fence+'hello'+fence and
    // ate the actual content. Match only the well-known JSON-mode tags.
    .replace(/```(?:json|javascript|js)?/gi, '')
    .replace(/[{}"\\]/g, '')
    .replace(/\bword\b/gi, '')
    .replace(/\bjson\b/gi, '')
    .replace(/[:,]/g, ' ');
  const match = stripped.match(/[a-zA-Z][a-zA-Z\s]*/);
  return match ? match[0].trim().toLowerCase() : '';
}

/**
 * Parse a raw Claude response in word mode. Returns { word: '' } when nothing
 * recognizable could be extracted.
 */
export function parseWordResponse(rawText: string): WordParseResult {
  try {
    const cleaned = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*?\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
    // JSON parsed successfully — trust the shape. If the word field is
    // missing or non-string, return empty rather than salvaging from raw
    // text (which still contains JSON keys/braces and would surface noise
    // like 'other' as the recognized word).
    return {
      word: typeof parsed?.word === 'string' ? parsed.word.trim() : '',
    };
  } catch {
    return { word: salvageWord(rawText) };
  }
}

/**
 * Parse a raw Claude response in photo/drawing mode. Falls back to using the
 * first line of the response as both literal and contextual when JSON parsing
 * fails.
 */
export function parseDrawingResponse(rawText: string): DrawingParseResult {
  try {
    const cleaned = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*?\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
    return {
      literal: typeof parsed?.literal === 'string' ? parsed.literal.trim() : 'something',
      contextual:
        typeof parsed?.contextual === 'string' ? parsed.contextual.trim() : 'something',
      alternatives: Array.isArray(parsed?.alternatives)
        ? parsed.alternatives.filter((a: unknown) => typeof a === 'string')
        : [],
    };
  } catch {
    const fallback = rawText.trim().split('\n')[0].slice(0, 40);
    return { literal: fallback, contextual: fallback, alternatives: [] };
  }
}
