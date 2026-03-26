/**
 * Strips markdown code fences from Claude API responses.
 *
 * Claude sometimes wraps JSON in ```json ... ``` or ``` ... ``` fences
 * despite being told to return raw JSON. This utility extracts the inner
 * content so JSON.parse() can handle it.
 *
 * Extracted from supabase/functions/predict/index.ts so it's testable
 * with Jest (the edge function runs in Deno, not Node).
 */
export function stripMarkdownFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim();
}
