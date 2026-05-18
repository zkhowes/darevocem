/**
 * Regression tests for Claude JSON parsing used by /identify edge function.
 *
 * These cover every malformed-response shape we'\''ve observed in production:
 *   - bare JSON
 *   - fenced JSON (```json ... ```)
 *   - JSON with preamble ("Here is the word: {...}")
 *   - JSON with trailing commentary
 *   - completely malformed text -> salvage
 *   - empty response
 *   - response containing the literal string 'json' (the bug that made a P0
 *     card appear with text 'json' on the phone before this fix)
 */

import {
  parseWordResponse,
  parseDrawingResponse,
  salvageWord,
} from '../utils/parseClaudeJson';

describe('parseWordResponse', () => {
  it('parses bare JSON', () => {
    expect(parseWordResponse('{"word": "hi"}')).toEqual({ word: 'hi' });
  });

  it('parses JSON with surrounding whitespace', () => {
    expect(parseWordResponse('   {"word": "hello"}   \n')).toEqual({ word: 'hello' });
  });

  it('parses ```json fenced response', () => {
    const raw = '```json\n{"word": "coffee"}\n```';
    expect(parseWordResponse(raw)).toEqual({ word: 'coffee' });
  });

  it('parses ``` (no language tag) fenced response', () => {
    const raw = '```\n{"word": "water"}\n```';
    expect(parseWordResponse(raw)).toEqual({ word: 'water' });
  });

  it('parses JSON with preamble before the object', () => {
    const raw = 'Here is the word you wrote: {"word": "amanda"}';
    expect(parseWordResponse(raw)).toEqual({ word: 'amanda' });
  });

  it('parses JSON with trailing commentary after the object', () => {
    const raw = '{"word": "flower"}\nNote: confidence high.';
    expect(parseWordResponse(raw)).toEqual({ word: 'flower' });
  });

  it('returns empty word for empty input', () => {
    expect(parseWordResponse('')).toEqual({ word: '' });
  });

  it('trims surrounding whitespace from extracted word', () => {
    expect(parseWordResponse('{"word": "   hi   "}')).toEqual({ word: 'hi' });
  });

  it('handles multi-word values (e.g. "good morning")', () => {
    expect(parseWordResponse('{"word": "good morning"}')).toEqual({ word: 'good morning' });
  });

  // Regression for the bug where a malformed fenced response led the salvage
  // path to return the literal token 'json' as the recognized word, which
  // surfaced on the phone as a P0 card reading "json".
  it('salvages to empty rather than returning literal "json" for unparseable fenced text', () => {
    // No JSON braces, fenced word 'json' alone — old salvage would return 'json'
    const raw = '```json\n```';
    expect(parseWordResponse(raw)).toEqual({ word: '' });
  });

  it('falls back to salvage when JSON is unparseable', () => {
    // Claude returned a sentence instead of JSON
    const raw = 'I think the word is hello';
    // Salvage finds first letter run, lowercased — "I think the" is plausible
    // but our salvage takes the first match which could be "I" — accept that
    const out = parseWordResponse(raw);
    expect(out.word).not.toBe('');
    expect(out.word.toLowerCase()).toBe(out.word); // always lowercased on salvage
  });

  it('does not crash on responses with only special characters', () => {
    expect(() => parseWordResponse('!@#$%^&*()')).not.toThrow();
    expect(parseWordResponse('!@#$%^&*()').word).toBe('');
  });

  it('returns empty word when word field is missing in valid JSON', () => {
    // Valid JSON but wrong shape — fall back to salvage
    expect(parseWordResponse('{"other": "stuff"}')).toEqual({ word: '' });
  });

  it('returns empty word when word field is not a string', () => {
    expect(parseWordResponse('{"word": 42}')).toEqual({ word: '' });
  });
});

describe('parseDrawingResponse', () => {
  it('parses bare JSON with all fields', () => {
    const raw = '{"literal":"flower","contextual":"to see the flowers","alternatives":["a rose"]}';
    expect(parseDrawingResponse(raw)).toEqual({
      literal: 'flower',
      contextual: 'to see the flowers',
      alternatives: ['a rose'],
    });
  });

  it('parses fenced JSON', () => {
    const raw = '```json\n{"literal":"dog","contextual":"to pet the dog","alternatives":[]}\n```';
    expect(parseDrawingResponse(raw)).toEqual({
      literal: 'dog',
      contextual: 'to pet the dog',
      alternatives: [],
    });
  });

  it('parses JSON with preamble', () => {
    const raw = 'Here is the result: {"literal":"heart","contextual":"my love","alternatives":[]}';
    expect(parseDrawingResponse(raw)).toEqual({
      literal: 'heart',
      contextual: 'my love',
      alternatives: [],
    });
  });

  it('defaults missing fields to "something"', () => {
    expect(parseDrawingResponse('{"literal":"flower"}')).toEqual({
      literal: 'flower',
      contextual: 'something',
      alternatives: [],
    });
  });

  it('filters non-string alternatives', () => {
    const raw = '{"literal":"x","contextual":"y","alternatives":["good", 42, null, "bad"]}';
    expect(parseDrawingResponse(raw).alternatives).toEqual(['good', 'bad']);
  });

  it('falls back to first line on unparseable response', () => {
    const raw = 'flower\n(I think — confidence medium)';
    expect(parseDrawingResponse(raw)).toEqual({
      literal: 'flower',
      contextual: 'flower',
      alternatives: [],
    });
  });

  it('caps fallback at 40 characters', () => {
    const longLine = 'a'.repeat(100);
    const result = parseDrawingResponse(longLine);
    expect(result.literal.length).toBe(40);
  });
});

describe('salvageWord', () => {
  it('returns empty for empty input', () => {
    expect(salvageWord('')).toBe('');
  });

  it('strips fence markers', () => {
    expect(salvageWord('```hello```')).toBe('hello');
  });

  it('strips JSON-format keywords', () => {
    // 'json' and 'word' are noise in malformed Claude responses
    expect(salvageWord('json word hi')).toBe('hi');
  });

  it('lowercases the result', () => {
    expect(salvageWord('HELLO')).toBe('hello');
  });

  it('strips JSON syntax characters', () => {
    expect(salvageWord('{"word": "hi"}')).toBe('hi');
  });

  it('returns empty when no letter runs exist', () => {
    expect(salvageWord('!@#$%^&*()')).toBe('');
  });
});
