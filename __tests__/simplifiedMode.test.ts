// Tests for simplified mode behavior and wordType passthrough.
// These verify the data transformations without rendering React components.

import { SIMPLIFIED } from '../constants/config';
import { INTENTS } from '../constants/intents';
import type { ComposeItem, WordType } from '../types';

// ─── SIMPLIFIED MODE CONSTANTS ───────────────────────────────────────────────

describe('Simplified mode — constants', () => {
  it('limits predictions to 3', () => {
    expect(SIMPLIFIED.maxPredictions).toBe(3);
  });

  it('limits intents to 4', () => {
    expect(SIMPLIFIED.maxIntents).toBe(4);
  });

  it('has larger item heights than standard mode', () => {
    expect(SIMPLIFIED.wheelPickerItemHeight).toBeGreaterThan(72); // standard is 72
    expect(SIMPLIFIED.wheelPickerFocusedHeight).toBeGreaterThan(120); // standard is 120
  });

  it('has larger font sizes than standard mode', () => {
    expect(SIMPLIFIED.wheelPickerItemFontSize).toBeGreaterThan(22); // standard is 22
    expect(SIMPLIFIED.wheelPickerFocusedFontSize).toBeGreaterThan(32); // standard is 32
  });
});

// ─── SIMPLIFIED MODE — ITEM LIMITING ─────────────────────────────────────────
// This tests the same logic used in ComposeSection to limit visible items.

describe('Simplified mode — item limiting', () => {
  const mockPredictions: ComposeItem[] = [
    { id: '1', text: 'water', itemType: 'prediction', rank: 0 },
    { id: '2', text: 'help', itemType: 'prediction', rank: 1 },
    { id: '3', text: 'rest', itemType: 'prediction', rank: 2 },
    { id: '4', text: 'medication', itemType: 'prediction', rank: 3 },
    { id: '5', text: 'to go outside', itemType: 'prediction', rank: 4 },
  ];

  it('standard mode shows all items', () => {
    const density = 'standard';
    const visible = density === 'simplified'
      ? mockPredictions.slice(0, SIMPLIFIED.maxPredictions)
      : mockPredictions;
    expect(visible).toHaveLength(5);
  });

  it('simplified mode limits to maxPredictions (3)', () => {
    const density = 'simplified';
    const visible = density === 'simplified'
      ? mockPredictions.slice(0, SIMPLIFIED.maxPredictions)
      : mockPredictions;
    expect(visible).toHaveLength(3);
    expect(visible.map((v) => v.text)).toEqual(['water', 'help', 'rest']);
  });

  it('simplified mode with fewer items than limit shows all', () => {
    const fewItems = mockPredictions.slice(0, 2);
    const density = 'simplified';
    const visible = density === 'simplified'
      ? fewItems.slice(0, SIMPLIFIED.maxPredictions)
      : fewItems;
    expect(visible).toHaveLength(2);
  });
});

// ─── SIMPLIFIED MODE — INTENT LIMITING ───────────────────────────────────────

describe('Simplified mode — intent limiting', () => {
  it('simplified mode limits cycling to first 4 intents', () => {
    const maxIntents = SIMPLIFIED.maxIntents;
    expect(maxIntents).toBe(4);
    // The first 4 intents should be the most essential
    const simplifiedIntents = INTENTS.slice(0, maxIntents);
    expect(simplifiedIntents).toHaveLength(4);
    // Verify they're the core intents
    const texts = simplifiedIntents.map((i) => i.text);
    expect(texts).toContain('I need');
    expect(texts).toContain('I want');
  });

  it('standard mode allows all intents', () => {
    expect(INTENTS.length).toBeGreaterThan(4);
  });
});

// ─── WORDTYPE ON COMPOSITEM ──────────────────────────────────────────────────

describe('ComposeItem — wordType field', () => {
  it('wordType is optional (backward compatible)', () => {
    const item: ComposeItem = {
      id: '1',
      text: 'water',
      itemType: 'prediction',
      rank: 0,
    };
    expect(item.wordType).toBeUndefined();
  });

  it('wordType can be set to a valid WordType', () => {
    const item: ComposeItem = {
      id: '1',
      text: 'water',
      itemType: 'prediction',
      rank: 0,
      wordType: 'noun',
    };
    expect(item.wordType).toBe('noun');
  });

  it('predictions without wordType still have correct shape', () => {
    const items: ComposeItem[] = [
      { id: '1', text: 'water', itemType: 'prediction', rank: 0 },
      { id: '2', text: 'go', itemType: 'prediction', rank: 1, wordType: 'verb' },
    ];
    // First item has no wordType — backward compatible
    expect(items[0].wordType).toBeUndefined();
    // Second item has wordType — new behavior
    expect(items[1].wordType).toBe('verb');
    // Both have the required fields
    items.forEach((item) => {
      expect(item.id).toBeDefined();
      expect(item.text).toBeDefined();
      expect(item.itemType).toBe('prediction');
      expect(typeof item.rank).toBe('number');
    });
  });
});

// ─── REGRESSION — existing ComposeItem fields unchanged ──────────────────────

describe('REGRESSION — ComposeItem shape is backward compatible', () => {
  it('existing fields are still present and typed correctly', () => {
    const item: ComposeItem = {
      id: 'test-id',
      text: 'coffee',
      itemType: 'prediction',
      rank: 0,
      label: 'P1',
      value: 'coffee',
      isDynamic: false,
    };
    expect(item.id).toBe('test-id');
    expect(item.text).toBe('coffee');
    expect(item.itemType).toBe('prediction');
    expect(item.rank).toBe(0);
    expect(item.label).toBe('P1');
    expect(item.value).toBe('coffee');
    expect(item.isDynamic).toBe(false);
  });

  it('common and saved item types still work', () => {
    const common: ComposeItem = { id: '1', text: 'March 24', itemType: 'common', rank: 0 };
    const saved: ComposeItem = { id: '2', text: 'I love you', itemType: 'saved', rank: 0 };
    expect(common.itemType).toBe('common');
    expect(saved.itemType).toBe('saved');
  });
});
