// Mock the module stack openIntent pulls in transitively (composition store +
// predictions service via predictionCache).
jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((k: string) => Promise.resolve(store[k] ?? null)),
      setItem: jest.fn((k: string, v: string) => { store[k] = v; return Promise.resolve(); }),
      removeItem: jest.fn((k: string) => { delete store[k]; return Promise.resolve(); }),
    },
  };
});
jest.mock('react-native-url-polyfill/auto', () => {});
jest.mock('../services/supabase', () => ({
  supabase: { functions: { invoke: jest.fn() } },
}));

// Control the cache peek directly so we can exercise both warm and cold paths.
jest.mock('../services/predictionCache', () => ({
  getCachedPredictions: jest.fn(),
  getOrFetchPredictions: jest.fn(() => Promise.resolve({ predictions: [], source: 'cold' })),
}));

import { openIntent } from '../utils/openIntent';
import { useCompositionStore } from '../stores/composition';
import { getCachedPredictions, getOrFetchPredictions } from '../services/predictionCache';

const mockCached = getCachedPredictions as jest.Mock;
const mockFetch = getOrFetchPredictions as jest.Mock;

function makeRouter() {
  return { push: jest.fn() } as never;
}

describe('openIntent — Home/Predicted selection parity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useCompositionStore.getState().reset();
  });

  it('pushes compose with the intent as a prediction param', () => {
    mockCached.mockReturnValue(null);
    const router = makeRouter();

    openIntent(router, 'I would like');

    expect((router as { push: jest.Mock }).push).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(app)/compose',
        params: { type: 'prediction', value: 'I would like' },
      }),
    );
    // Intent is preloaded into the composition store.
    expect(useCompositionStore.getState().intent).toBe('I would like');
  });

  it('warm cache hit skips the loading state and the background fetch', () => {
    mockCached.mockReturnValue([{ id: '1', text: 'coffee', itemType: 'prediction', rank: 0 }]);
    const router = makeRouter();

    openIntent(router, 'I need');

    expect(useCompositionStore.getState().isLoading).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('cold cache sets loading and fires the background fetch', () => {
    mockCached.mockReturnValue(null);
    const router = makeRouter();

    openIntent(router, 'Where is the');

    expect(useCompositionStore.getState().isLoading).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith('Where is the', expect.any(String));
  });
});
