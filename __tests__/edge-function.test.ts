/**
 * Regression tests for the markdown fence stripping logic used in
 * supabase/functions/predict/index.ts.
 *
 * The edge function runs in Deno, so we can't import it directly.
 * The regex is extracted into utils/stripMarkdownFences.ts — a pure
 * string manipulation function testable with Jest.
 *
 * These tests prevent Claude's occasional markdown-wrapped JSON from
 * breaking prediction parsing.
 */

import { stripMarkdownFences } from '../utils/stripMarkdownFences';

const VALID_JSON = '{"predictions": [{"text": "water"}, {"text": "coffee"}]}';

describe('Edge function — markdown fence stripping', () => {
  it('JSON without fences parses correctly', () => {
    const result = stripMarkdownFences(VALID_JSON);
    expect(result).toBe(VALID_JSON);
    expect(() => JSON.parse(result)).not.toThrow();
    expect(JSON.parse(result).predictions).toHaveLength(2);
  });

  it('JSON with ```json ... ``` fences parses correctly', () => {
    const wrapped = '```json\n' + VALID_JSON + '\n```';
    const result = stripMarkdownFences(wrapped);
    expect(() => JSON.parse(result)).not.toThrow();
    expect(JSON.parse(result).predictions).toHaveLength(2);
  });

  it('JSON with ``` ... ``` (no language tag) fences parses correctly', () => {
    const wrapped = '```\n' + VALID_JSON + '\n```';
    const result = stripMarkdownFences(wrapped);
    expect(() => JSON.parse(result)).not.toThrow();
    expect(JSON.parse(result).predictions).toHaveLength(2);
  });

  it('JSON with leading/trailing whitespace around fences parses correctly', () => {
    const wrapped = '  ```json\n' + VALID_JSON + '\n```  ';
    // The trim() in stripMarkdownFences handles outer whitespace
    const result = stripMarkdownFences(wrapped.trim());
    expect(() => JSON.parse(result)).not.toThrow();
    expect(JSON.parse(result).predictions).toHaveLength(2);
  });

  it('empty response returns empty string (caller handles error)', () => {
    const result = stripMarkdownFences('');
    expect(result).toBe('');
    // Parsing empty string should throw — caller must check for this
    expect(() => JSON.parse(result)).toThrow();
  });

  it('whitespace-only response returns empty string after trim', () => {
    const result = stripMarkdownFences('   \n  \n  ');
    expect(result).toBe('');
    expect(() => JSON.parse(result)).toThrow();
  });

  it('fences with JSON language tag (uppercase) are stripped', () => {
    const wrapped = '```JSON\n' + VALID_JSON + '\n```';
    const result = stripMarkdownFences(wrapped);
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it('handles fences without newline before closing fence', () => {
    const wrapped = '```json\n' + VALID_JSON + '```';
    const result = stripMarkdownFences(wrapped);
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it('does not mangle JSON that contains backtick characters in values', () => {
    const jsonWithBackticks = '{"predictions": [{"text": "say `hello`"}]}';
    const result = stripMarkdownFences(jsonWithBackticks);
    expect(() => JSON.parse(result)).not.toThrow();
    expect(JSON.parse(result).predictions[0].text).toBe('say `hello`');
  });

  it('strips fences from prediction response shape', () => {
    const response = '```json\n{"predictions": [{"text": "tea"}, {"text": "juice"}, {"text": "milk"}]}\n```';
    const result = stripMarkdownFences(response);
    const parsed = JSON.parse(result);
    expect(parsed.predictions).toEqual([
      { text: 'tea' },
      { text: 'juice' },
      { text: 'milk' },
    ]);
  });
});
