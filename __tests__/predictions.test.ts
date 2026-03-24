// Mock AsyncStorage before any imports that use it
jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((key: string) => Promise.resolve(store[key] ?? null)),
      setItem: jest.fn((key: string, value: string) => {
        store[key] = value;
        return Promise.resolve();
      }),
      removeItem: jest.fn((key: string) => {
        delete store[key];
        return Promise.resolve();
      }),
    },
  };
});

// Mock react-native-url-polyfill (pulled in by services/supabase.ts)
jest.mock('react-native-url-polyfill/auto', () => {});

// Mock the Supabase client — we control invoke() per test.
// The factory must be self-contained (jest.mock is hoisted before variable init),
// so we expose the mock function through the module object.
jest.mock('../services/supabase', () => ({
  supabase: {
    functions: {
      invoke: jest.fn(),
    },
  },
}));

import { getPredictions, getRefinements, getModifiers } from '../services/predictions';
import { FALLBACK_PREDICTIONS } from '../constants/fallbacks';
import { supabase } from '../services/supabase';

// Typed reference to the mock so we can configure return values per test
const mockInvoke = supabase.functions.invoke as jest.Mock;

// Helper that makes fallback items for a given intent
function expectedFallbacks(intent: string) {
  const texts = FALLBACK_PREDICTIONS[intent] ?? FALLBACK_PREDICTIONS['I need'];
  return texts.map((text, i) => expect.objectContaining({ text, rank: i, itemType: 'prediction' }));
}

beforeEach(() => {
  mockInvoke.mockReset();
});

// ─── getPredictions ───────────────────────────────────────────────────────────

describe('getPredictions — success path', () => {
  it('returns predictions array mapped to ComposeItem[]', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        predictions: [
          { text: 'water', type: 'object' },
          { text: 'help', type: 'object' },
        ],
        fallback: false,
      },
      error: null,
    });

    const result = await getPredictions('I need', [], 'object', 'morning', [], []);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ text: 'water', itemType: 'prediction', rank: 0 });
    expect(result[1]).toMatchObject({ text: 'help', itemType: 'prediction', rank: 1 });
    // Each item must have a generated id
    expect(typeof result[0].id).toBe('string');
    expect(result[0].id).not.toBe('');
  });

  it('maps response to ComposeItem array with correct shape', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        predictions: [{ text: 'coffee', type: 'object' }],
        fallback: false,
      },
      error: null,
    });

    const result = await getPredictions('I want', [], 'object', 'morning', [], []);
    expect(result[0]).toHaveProperty('id');
    expect(result[0]).toHaveProperty('text', 'coffee');
    expect(result[0]).toHaveProperty('itemType', 'prediction');
    expect(result[0]).toHaveProperty('rank', 0);
  });
});

describe('getPredictions — fallback on error', () => {
  it('returns curated fallbacks when invoke returns an error', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: new Error('network error') });

    const result = await getPredictions('I need', [], 'object', 'morning', [], []);
    expect(result).toEqual(expectedFallbacks('I need'));
  });

  it('returns curated fallbacks when invoke throws (timeout/crash)', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('timeout'));

    const result = await getPredictions('I need', [], 'object', 'morning', [], []);
    expect(result).toEqual(expectedFallbacks('I need'));
  });

  it('returns curated fallbacks when data.fallback is true', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { predictions: [], fallback: true },
      error: null,
    });

    const result = await getPredictions('I feel', [], 'object', 'evening', [], []);
    expect(result).toEqual(expectedFallbacks('I feel'));
  });

  it('returns curated fallbacks when predictions array is empty', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { predictions: [], fallback: false },
      error: null,
    });

    const result = await getPredictions('I need', [], 'object', 'morning', [], []);
    expect(result).toEqual(expectedFallbacks('I need'));
  });
});

describe('getPredictions — fallback matches constants/fallbacks.ts', () => {
  it('fallback for "I need" matches FALLBACK_PREDICTIONS["I need"]', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('offline'));

    const result = await getPredictions('I need', [], 'object', 'morning', [], []);
    const expectedTexts = FALLBACK_PREDICTIONS['I need'];
    expect(result.map((r) => r.text)).toEqual(expectedTexts);
  });

  it('fallback for "I feel" matches FALLBACK_PREDICTIONS["I feel"]', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('offline'));

    const result = await getPredictions('I feel', [], 'object', 'evening', [], []);
    const expectedTexts = FALLBACK_PREDICTIONS['I feel'];
    expect(result.map((r) => r.text)).toEqual(expectedTexts);
  });

  it('fallback for unknown intent falls back to "I need"', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('offline'));

    const result = await getPredictions('Unknown intent', [], 'object', 'morning', [], []);
    const expectedTexts = FALLBACK_PREDICTIONS['I need'];
    expect(result.map((r) => r.text)).toEqual(expectedTexts);
  });
});

// ─── getRefinements ───────────────────────────────────────────────────────────

describe('getRefinements', () => {
  it('returns alternatives excluding the original item', async () => {
    const result = await getRefinements('I need', ['I need'], 'water');
    const texts = result.map((r) => r.text);
    expect(texts).not.toContain('water');
    // Should still return some items
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns ComposeItem[] with correct shape', async () => {
    const result = await getRefinements('I want', [], 'coffee');
    result.forEach((item) => {
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('text');
      expect(item).toHaveProperty('itemType', 'prediction');
      expect(item).toHaveProperty('rank');
    });
  });
});

// ─── getModifiers ─────────────────────────────────────────────────────────────

describe('getModifiers', () => {
  it('returns extensions for a given item', async () => {
    const result = await getModifiers('I need', ['I need'], 'water');
    expect(result.length).toBeGreaterThan(0);
    // At least one modifier should reference the target item
    const texts = result.map((r) => r.text);
    expect(texts.some((t) => t.includes('water'))).toBe(true);
  });

  it('returns ComposeItem[] with correct shape', async () => {
    const result = await getModifiers('I want', [], 'coffee');
    result.forEach((item) => {
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('text');
      expect(item).toHaveProperty('itemType', 'prediction');
      expect(item).toHaveProperty('rank');
    });
  });
});
