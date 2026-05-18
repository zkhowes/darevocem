/**
 * Tests for the prediction merge helpers used to inject contextual
 * common-phrase suggestions:
 *   - splicePredictionAtP1 (compose: P0 = literal captured input, P1 = ctx)
 *   - mergeCommonPhrase    (home: prepend ctx onto time-of-day common list)
 *
 * These are async cross-cutting paths that previously had subtle bugs:
 *   - Clobbering P0 with the contextual suggestion
 *   - Double-adding the same suggestion when fired twice
 *   - Bumping ranks but not for items below the splice point
 */

import {
  splicePredictionAtP1,
  mergeCommonPhrase,
} from '../utils/predictionMerge';
import type { ComposeItem } from '../types';

const makeItem = (
  text: string,
  itemType: ComposeItem['itemType'] = 'prediction',
  rank: number = 0,
): ComposeItem => ({
  id: `id-${text}`,
  text,
  itemType,
  rank,
});

describe('splicePredictionAtP1', () => {
  it('inserts the contextual item at index 1 after P0', () => {
    const predictions = [
      makeItem('water', 'prediction', 0),
      makeItem('coffee', 'prediction', 1),
    ];
    const ctx = makeItem('a glass of water', 'common', 0);
    const result = splicePredictionAtP1(predictions, ctx);
    expect(result[0].text).toBe('water'); // P0 untouched
    expect(result[1].text).toBe('a glass of water');
    expect(result[2].text).toBe('coffee');
  });

  it('forces the spliced item to itemType "common" and rank 1', () => {
    const predictions = [makeItem('water')];
    // Caller passes whatever — we should re-tag
    const ctx = { ...makeItem('a glass of water'), itemType: 'prediction' as const, rank: 99 };
    const result = splicePredictionAtP1(predictions, ctx);
    expect(result[1].itemType).toBe('common');
    expect(result[1].rank).toBe(1);
  });

  it('bumps ranks of items at index >= 1 after the splice', () => {
    const predictions = [
      makeItem('a', 'prediction', 0),
      makeItem('b', 'prediction', 1),
      makeItem('c', 'prediction', 2),
    ];
    const ctx = makeItem('inserted', 'common', 0);
    const result = splicePredictionAtP1(predictions, ctx);
    expect(result.map((r) => ({ text: r.text, rank: r.rank }))).toEqual([
      { text: 'a', rank: 0 },
      { text: 'inserted', rank: 1 },
      { text: 'b', rank: 2 },
      { text: 'c', rank: 3 },
    ]);
  });

  it('returns the original array (===) when predictions is empty', () => {
    const predictions: ComposeItem[] = [];
    const ctx = makeItem('something', 'common', 0);
    expect(splicePredictionAtP1(predictions, ctx)).toBe(predictions);
  });

  it('returns the original array (===) when an item with same text already exists', () => {
    const predictions = [
      makeItem('water', 'prediction', 0),
      makeItem('coffee', 'prediction', 1),
    ];
    const ctx = makeItem('coffee', 'common', 0);
    expect(splicePredictionAtP1(predictions, ctx)).toBe(predictions);
  });

  it('dedupes case-insensitively', () => {
    const predictions = [makeItem('Coffee', 'prediction', 0)];
    const ctx = makeItem('COFFEE', 'common', 0);
    expect(splicePredictionAtP1(predictions, ctx)).toBe(predictions);
  });

  it('does not mutate the input array', () => {
    const predictions = [
      makeItem('water', 'prediction', 0),
      makeItem('coffee', 'prediction', 1),
    ];
    const before = JSON.stringify(predictions);
    splicePredictionAtP1(predictions, makeItem('tea', 'common', 0));
    expect(JSON.stringify(predictions)).toBe(before);
  });
});

describe('mergeCommonPhrase', () => {
  it('prepends the new phrase to the front of the list', () => {
    const current = [
      makeItem('I need coffee', 'common', 0),
      makeItem('Good morning', 'common', 1),
    ];
    const item = makeItem('I need water', 'common', 0);
    const result = mergeCommonPhrase(current, item);
    expect(result[0].text).toBe('I need water');
    expect(result[1].text).toBe('I need coffee');
    expect(result[2].text).toBe('Good morning');
  });

  it('caps the result at maxLength (default 4)', () => {
    const current = [
      makeItem('a', 'common', 0),
      makeItem('b', 'common', 1),
      makeItem('c', 'common', 2),
      makeItem('d', 'common', 3),
    ];
    const result = mergeCommonPhrase(current, makeItem('new', 'common', 0));
    expect(result.length).toBe(4);
    expect(result[0].text).toBe('new');
    expect(result[result.length - 1].text).toBe('c'); // 'd' dropped
  });

  it('respects a custom maxLength', () => {
    const current = [makeItem('a', 'common', 0), makeItem('b', 'common', 1)];
    const result = mergeCommonPhrase(current, makeItem('new', 'common', 0), 2);
    expect(result.length).toBe(2);
    expect(result.map((r) => r.text)).toEqual(['new', 'a']);
  });

  it('dedupes by lowercased text', () => {
    const current = [makeItem('I need coffee', 'common', 0)];
    const result = mergeCommonPhrase(current, makeItem('i need coffee', 'common', 0));
    expect(result).toBe(current); // referential identity = no-op
  });

  it('does not mutate the input array', () => {
    const current = [makeItem('existing', 'common', 0)];
    const before = JSON.stringify(current);
    mergeCommonPhrase(current, makeItem('new', 'common', 0));
    expect(JSON.stringify(current)).toBe(before);
  });

  it('returns a new array when the merge actually happens', () => {
    const current = [makeItem('existing', 'common', 0)];
    const result = mergeCommonPhrase(current, makeItem('new', 'common', 0));
    expect(result).not.toBe(current);
  });

  it('handles an empty initial list', () => {
    const result = mergeCommonPhrase([], makeItem('new', 'common', 0));
    expect(result.length).toBe(1);
    expect(result[0].text).toBe('new');
  });
});
