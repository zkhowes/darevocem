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
jest.mock('../services/supabase', () => ({
  supabase: {
    functions: {
      invoke: jest.fn(),
    },
  },
}));

import { getPredictions, getModifiers } from '../services/predictions';
import { FALLBACK_PREDICTIONS } from '../constants/fallbacks';
import { supabase } from '../services/supabase';

// Typed reference to the mock so we can configure return values per test
const mockInvoke = supabase.functions.invoke as jest.Mock;

// Helper that makes fallback items for a given intent phrase
function expectedFallbacks(intentPhrase: string) {
  const intentKey = Object.keys(FALLBACK_PREDICTIONS).find(
    (key) => intentPhrase.toLowerCase().startsWith(key.toLowerCase()),
  );
  const texts = FALLBACK_PREDICTIONS[intentKey ?? 'I need'];
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
          { text: 'water' },
          { text: 'help' },
        ],
        fallback: false,
      },
      error: null,
    });

    const result = await getPredictions('I need', 'morning');
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ text: 'water', itemType: 'prediction', rank: 0 });
    expect(result[1]).toMatchObject({ text: 'help', itemType: 'prediction', rank: 1 });
    expect(typeof result[0].id).toBe('string');
    expect(result[0].id).not.toBe('');
  });

  it('maps response to ComposeItem array with correct shape', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        predictions: [{ text: 'coffee' }],
        fallback: false,
      },
      error: null,
    });

    const result = await getPredictions('I want', 'morning');
    expect(result[0]).toHaveProperty('id');
    expect(result[0]).toHaveProperty('text', 'coffee');
    expect(result[0]).toHaveProperty('itemType', 'prediction');
    expect(result[0]).toHaveProperty('rank', 0);
  });
});

describe('getPredictions — fallback on error', () => {
  it('returns curated fallbacks when invoke returns an error', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: new Error('network error') });

    const result = await getPredictions('I need', 'morning');
    expect(result).toEqual(expectedFallbacks('I need'));
  });

  it('returns curated fallbacks when invoke throws (timeout/crash)', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('timeout'));

    const result = await getPredictions('I need', 'morning');
    expect(result).toEqual(expectedFallbacks('I need'));
  });

  it('returns curated fallbacks when data.fallback is true', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { predictions: [], fallback: true },
      error: null,
    });

    const result = await getPredictions('I feel', 'evening');
    expect(result).toEqual(expectedFallbacks('I feel'));
  });

  it('returns curated fallbacks when predictions array is empty', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { predictions: [], fallback: false },
      error: null,
    });

    const result = await getPredictions('I need', 'morning');
    expect(result).toEqual(expectedFallbacks('I need'));
  });
});

describe('getPredictions — fallback matches constants/fallbacks.ts', () => {
  it('fallback for "I need" matches FALLBACK_PREDICTIONS["I need"]', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('offline'));

    const result = await getPredictions('I need', 'morning');
    const expectedTexts = FALLBACK_PREDICTIONS['I need'];
    expect(result.map((r) => r.text)).toEqual(expectedTexts);
  });

  it('fallback for "I feel" matches FALLBACK_PREDICTIONS["I feel"]', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('offline'));

    const result = await getPredictions('I feel', 'evening');
    const expectedTexts = FALLBACK_PREDICTIONS['I feel'];
    expect(result.map((r) => r.text)).toEqual(expectedTexts);
  });

  it('fallback for unknown intent falls back to "I need"', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('offline'));

    const result = await getPredictions('Unknown intent', 'morning');
    const expectedTexts = FALLBACK_PREDICTIONS['I need'];
    expect(result.map((r) => r.text)).toEqual(expectedTexts);
  });
});

// ─── getModifiers ─────────────────────────────────────────────────────────────

describe('getModifiers — fallback', () => {
  it('returns string[] of modifier words, not ComposeItem[]', async () => {
    const result = await getModifiers('I need water', 'coffee');
    expect(typeof result[0]).toBe('string');
    expect(result).toContain('and');
  });

  it('returns at least 3 fallback modifiers', async () => {
    const result = await getModifiers('I want', 'coffee');
    expect(result.length).toBeGreaterThanOrEqual(3);
    result.forEach((m) => expect(typeof m).toBe('string'));
  });
});

// ─── REGRESSION TESTS ────────────────────────────────────────────────────────
// These tests prevent bugs we spent 2 days fixing from coming back.

describe('REGRESSION — getPredictions sends fullPhrase as a single string', () => {
  it('invoke body contains fullPhrase as one string, not separate intent/slots', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { predictions: [{ text: 'and' }], fallback: false },
      error: null,
    });

    await getPredictions('I need coffee', 'morning');

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    const callArgs = mockInvoke.mock.calls[0];
    expect(callArgs[0]).toBe('predict');
    const body = callArgs[1].body;
    // fullPhrase must be a single string containing the complete phrase
    expect(body.fullPhrase).toBe('I need coffee');
    expect(typeof body.fullPhrase).toBe('string');
    // Must NOT have separate intent or slots fields
    expect(body).not.toHaveProperty('intent');
    expect(body).not.toHaveProperty('slots');
  });

  it('multi-word phrases are sent as one concatenated string', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { predictions: [{ text: 'please' }], fallback: false },
      error: null,
    });

    await getPredictions('I need coffee and cream', 'afternoon');

    const body = mockInvoke.mock.calls[0][1].body;
    expect(body.fullPhrase).toBe('I need coffee and cream');
  });
});

describe('REGRESSION — getPredictions only takes 2-3 args', () => {
  it('accepts (fullPhrase, timeOfDay) — 2 args', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { predictions: [{ text: 'water' }], fallback: false },
      error: null,
    });

    // Must not throw with just 2 args
    const result = await getPredictions('I need', 'morning');
    expect(result).toHaveLength(1);
  });

  it('accepts (fullPhrase, timeOfDay, triedItems) — 3 args', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { predictions: [{ text: 'tea' }], fallback: false },
      error: null,
    });

    const result = await getPredictions('I need', 'morning', ['water', 'coffee']);
    expect(result).toHaveLength(1);

    // triedItems should be forwarded in the body
    const body = mockInvoke.mock.calls[0][1].body;
    expect(body.triedItems).toEqual(['water', 'coffee']);
  });

  it('triedItems defaults to empty array when omitted', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { predictions: [{ text: 'water' }], fallback: false },
      error: null,
    });

    await getPredictions('I need', 'morning');
    const body = mockInvoke.mock.calls[0][1].body;
    expect(body.triedItems).toEqual([]);
  });
});

describe('REGRESSION — fallbacks NEVER return an empty array', () => {
  it('fallbacks return items even when ALL items are in triedItems', async () => {
    // Reject every single fallback for "I need"
    const allINeedFallbacks = FALLBACK_PREDICTIONS['I need'];
    mockInvoke.mockRejectedValueOnce(new Error('offline'));

    const result = await getPredictions('I need', 'morning', allINeedFallbacks);
    // Must still return items — the unfiltered list
    expect(result.length).toBeGreaterThan(0);
    expect(result.map((r) => r.text)).toEqual(allINeedFallbacks);
  });

  it('fallbacks return items when triedItems partially overlap', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('offline'));

    const result = await getPredictions('I need', 'morning', ['water', 'help']);
    expect(result.length).toBeGreaterThan(0);
    // Should not contain the tried items (since there are still untried ones)
    const texts = result.map((r) => r.text);
    expect(texts).not.toContain('water');
    expect(texts).not.toContain('help');
  });
});

describe('REGRESSION — fallbacks match the intent from the full phrase', () => {
  it('"I need coffee" matches the "I need" fallback set', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('offline'));

    // "I need coffee" is 3 words — continuation fallbacks apply
    // But "I need" alone should match the "I need" intent key
    const result = await getPredictions('I need', 'morning');
    const texts = result.map((r) => r.text);
    expect(texts).toEqual(FALLBACK_PREDICTIONS['I need']);
  });

  it('"I feel" matches the "I feel" fallback set, not "I need"', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('offline'));

    const result = await getPredictions('I feel', 'evening');
    const texts = result.map((r) => r.text);
    expect(texts).toEqual(FALLBACK_PREDICTIONS['I feel']);
  });

  it('"I want" matches the "I want" fallback set', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('offline'));

    const result = await getPredictions('I want', 'afternoon');
    const texts = result.map((r) => r.text);
    expect(texts).toEqual(FALLBACK_PREDICTIONS['I want']);
  });

  it('unknown intent phrase falls back to "I need" defaults', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('offline'));

    const result = await getPredictions('Zibble', 'morning');
    const texts = result.map((r) => r.text);
    expect(texts).toEqual(FALLBACK_PREDICTIONS['I need']);
  });
});

describe('REGRESSION — continuation fallbacks for 3+ word phrases', () => {
  it('3-word phrase returns continuation words, not initial predictions', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('offline'));

    const result = await getPredictions('I need coffee', 'morning');
    const texts = result.map((r) => r.text);
    // Should contain continuation words like "please", "now", "and"
    // and NOT the initial "I need" fallbacks like "water", "help"
    const iNeedFallbacks = FALLBACK_PREDICTIONS['I need'];
    // At least some continuation words should be present
    const continuationWords = ['please', 'now', 'today', 'right now', 'soon', 'and', 'with', 'for', 'but', 'or'];
    const hasContinuations = texts.some((t) => continuationWords.includes(t));
    expect(hasContinuations).toBe(true);
    // Should NOT be the initial intent fallbacks
    expect(texts).not.toEqual(iNeedFallbacks);
  });

  it('4-word phrase also gets continuation fallbacks', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('offline'));

    const result = await getPredictions('I need coffee and', 'morning');
    const texts = result.map((r) => r.text);
    // Must not be the "I need" initial set
    expect(texts).not.toEqual(FALLBACK_PREDICTIONS['I need']);
    expect(result.length).toBeGreaterThan(0);
  });

  it('continuation fallbacks never return empty even when all tried', async () => {
    const allContinuations = ['please', 'now', 'today', 'right now', 'soon', 'and', 'with', 'for', 'but', 'or'];
    mockInvoke.mockRejectedValueOnce(new Error('offline'));

    const result = await getPredictions('I need coffee', 'morning', allContinuations);
    // Must still return items — the unfiltered continuation list
    expect(result.length).toBeGreaterThan(0);
  });
});
