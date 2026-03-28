// Mock AsyncStorage before importing the store
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

// Mock react-native-url-polyfill and supabase
jest.mock('react-native-url-polyfill/auto', () => {});
jest.mock('../services/supabase', () => ({
  supabase: {
    auth: { getSession: jest.fn(() => Promise.resolve({ data: { session: null } })) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({ eq: jest.fn(() => ({ single: jest.fn(() => Promise.resolve({ data: null })) })) })),
      upsert: jest.fn(() => Promise.resolve()),
    })),
  },
}));

import { usePreferencesStore } from '../stores/preferences';

// Reset store between tests by setting all values back to defaults
beforeEach(() => {
  const store = usePreferencesStore.getState();
  store.setTheme('light');
  store.setTextScale(1.0);
  store.setSpeechRate(1.0);
  store.setUseSystemTtsOnly(false);
  store.setShowFallbackButtons(false);
  store.setAuditoryPreview(true);
  store.setDisplayDensity('standard');
});

// ─── NEW PREFERENCES ─────────────────────────────────────────────────────────

describe('PreferencesStore — auditoryPreview', () => {
  it('defaults to true (ON by default)', () => {
    expect(usePreferencesStore.getState().auditoryPreview).toBe(true);
  });

  it('can be toggled off', () => {
    usePreferencesStore.getState().setAuditoryPreview(false);
    expect(usePreferencesStore.getState().auditoryPreview).toBe(false);
  });

  it('can be toggled back on', () => {
    usePreferencesStore.getState().setAuditoryPreview(false);
    usePreferencesStore.getState().setAuditoryPreview(true);
    expect(usePreferencesStore.getState().auditoryPreview).toBe(true);
  });
});

describe('PreferencesStore — displayDensity', () => {
  it('defaults to standard', () => {
    expect(usePreferencesStore.getState().displayDensity).toBe('standard');
  });

  it('can be set to simplified', () => {
    usePreferencesStore.getState().setDisplayDensity('simplified');
    expect(usePreferencesStore.getState().displayDensity).toBe('simplified');
  });

  it('can be switched back to standard', () => {
    usePreferencesStore.getState().setDisplayDensity('simplified');
    usePreferencesStore.getState().setDisplayDensity('standard');
    expect(usePreferencesStore.getState().displayDensity).toBe('standard');
  });
});

// ─── REGRESSION — existing preferences unchanged ─────────────────────────────

describe('REGRESSION — existing preferences still work', () => {
  it('theme defaults to light', () => {
    expect(usePreferencesStore.getState().theme).toBe('light');
  });

  it('textScale defaults to 1.0', () => {
    expect(usePreferencesStore.getState().textScale).toBe(1.0);
  });

  it('speechRate defaults to 1.0', () => {
    expect(usePreferencesStore.getState().speechRate).toBe(1.0);
  });

  it('useSystemTtsOnly defaults to false', () => {
    expect(usePreferencesStore.getState().useSystemTtsOnly).toBe(false);
  });

  it('showFallbackButtons defaults to false', () => {
    expect(usePreferencesStore.getState().showFallbackButtons).toBe(false);
  });

  it('setTheme still works', () => {
    usePreferencesStore.getState().setTheme('dark');
    expect(usePreferencesStore.getState().theme).toBe('dark');
  });

  it('setSpeechRate still works', () => {
    usePreferencesStore.getState().setSpeechRate(1.5);
    expect(usePreferencesStore.getState().speechRate).toBe(1.5);
  });
});

// ─── REGRESSION — new preferences don't affect existing ones ─────────────────

describe('REGRESSION — new preferences are independent of existing ones', () => {
  it('changing auditoryPreview does not affect other preferences', () => {
    usePreferencesStore.getState().setAuditoryPreview(false);
    expect(usePreferencesStore.getState().theme).toBe('light');
    expect(usePreferencesStore.getState().speechRate).toBe(1.0);
    expect(usePreferencesStore.getState().displayDensity).toBe('standard');
  });

  it('changing displayDensity does not affect other preferences', () => {
    usePreferencesStore.getState().setDisplayDensity('simplified');
    expect(usePreferencesStore.getState().theme).toBe('light');
    expect(usePreferencesStore.getState().auditoryPreview).toBe(true);
    expect(usePreferencesStore.getState().speechRate).toBe(1.0);
  });
});
