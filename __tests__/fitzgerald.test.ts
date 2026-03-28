import {
  FITZGERALD_COLORS,
  INTENT_CATEGORY,
  getIntentColor,
  getIntentCategory,
  getWordTypeColor,
} from '../constants/fitzgerald';
import { INTENTS } from '../constants/intents';
import type { WordType } from '../types';

// ─── FITZGERALD COLOR MAP ────────────────────────────────────────────────────

describe('Fitzgerald colors — constants', () => {
  it('has a color for every WordType', () => {
    const wordTypes: WordType[] = ['verb', 'noun', 'descriptor', 'person', 'question', 'negation', 'social', 'misc'];
    wordTypes.forEach((wt) => {
      expect(FITZGERALD_COLORS[wt]).toBeDefined();
      expect(typeof FITZGERALD_COLORS[wt]).toBe('string');
      expect(FITZGERALD_COLORS[wt]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
  });

  it('all colors are unique (no two categories share a color)', () => {
    const colors = Object.values(FITZGERALD_COLORS);
    const unique = new Set(colors);
    expect(unique.size).toBe(colors.length);
  });
});

// ─── INTENT CATEGORY MAPPING ─────────────────────────────────────────────────

describe('Fitzgerald — intent category mapping', () => {
  it('every curated intent has a Fitzgerald category', () => {
    INTENTS.forEach((intent) => {
      const category = INTENT_CATEGORY[intent.text];
      expect(category).toBeDefined();
      expect(typeof category).toBe('string');
    });
  });

  it('categories are valid WordType values', () => {
    const validTypes: WordType[] = ['verb', 'noun', 'descriptor', 'person', 'question', 'negation', 'social', 'misc'];
    Object.values(INTENT_CATEGORY).forEach((cat) => {
      expect(validTypes).toContain(cat);
    });
  });
});

// ─── getIntentColor ──────────────────────────────────────────────────────────

describe('getIntentColor', () => {
  it('returns the correct color for exact intent matches', () => {
    expect(getIntentColor('I need')).toBe(FITZGERALD_COLORS.verb);
    expect(getIntentColor("Don't")).toBe(FITZGERALD_COLORS.negation);
    expect(getIntentColor('Where is')).toBe(FITZGERALD_COLORS.question);
    expect(getIntentColor('Thank you')).toBe(FITZGERALD_COLORS.social);
    expect(getIntentColor('I love')).toBe(FITZGERALD_COLORS.person);
  });

  it('matches on prefix for modified intents', () => {
    expect(getIntentColor('I need to')).toBe(FITZGERALD_COLORS.verb);
    expect(getIntentColor('I want a')).toBe(FITZGERALD_COLORS.verb);
    expect(getIntentColor('Where is my')).toBe(FITZGERALD_COLORS.question);
  });

  it('returns default (verb/green) for unknown intents', () => {
    expect(getIntentColor('Zibble')).toBe(FITZGERALD_COLORS.verb);
    expect(getIntentColor('')).toBe(FITZGERALD_COLORS.verb);
  });
});

// ─── getIntentCategory ───────────────────────────────────────────────────────

describe('getIntentCategory', () => {
  it('returns the correct category for curated intents', () => {
    expect(getIntentCategory('I need')).toBe('verb');
    expect(getIntentCategory('Help')).toBe('negation');
    expect(getIntentCategory('Question')).toBe('question');
    expect(getIntentCategory('I feel')).toBe('descriptor');
  });

  it('falls back to verb for unknown intents', () => {
    expect(getIntentCategory('Unknown')).toBe('verb');
  });
});

// ─── getWordTypeColor ────────────────────────────────────────────────────────

describe('getWordTypeColor', () => {
  it('returns the correct color for each word type', () => {
    expect(getWordTypeColor('noun')).toBe(FITZGERALD_COLORS.noun);
    expect(getWordTypeColor('verb')).toBe(FITZGERALD_COLORS.verb);
    expect(getWordTypeColor('negation')).toBe(FITZGERALD_COLORS.negation);
  });

  it('returns misc color for undefined wordType', () => {
    expect(getWordTypeColor(undefined)).toBe(FITZGERALD_COLORS.misc);
  });
});

// ─── REGRESSION — colors must not change accidentally ────────────────────────
// If someone changes a Fitzgerald color, these tests catch it.
// AAC consistency is critical — changing colors confuses the user.

describe('REGRESSION — Fitzgerald Key colors are stable', () => {
  it('verb is green (#27AE60)', () => {
    expect(FITZGERALD_COLORS.verb).toBe('#27AE60');
  });

  it('noun is orange (#E07B2E)', () => {
    expect(FITZGERALD_COLORS.noun).toBe('#E07B2E');
  });

  it('negation is red (#C0392B)', () => {
    expect(FITZGERALD_COLORS.negation).toBe('#C0392B');
  });

  it('question is purple (#9B59B6)', () => {
    expect(FITZGERALD_COLORS.question).toBe('#9B59B6');
  });

  it('person is yellow (#F1C40F)', () => {
    expect(FITZGERALD_COLORS.person).toBe('#F1C40F');
  });

  it('social is pink (#E91E8C)', () => {
    expect(FITZGERALD_COLORS.social).toBe('#E91E8C');
  });

  it('descriptor is blue (#3498DB)', () => {
    expect(FITZGERALD_COLORS.descriptor).toBe('#3498DB');
  });
});
