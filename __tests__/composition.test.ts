// Mock AsyncStorage before importing the store (persist middleware needs it)
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

import { useCompositionStore } from '../stores/composition';
import type { SessionStep } from '../types';

beforeEach(() => {
  useCompositionStore.getState().reset();
});

describe('CompositionStore — initial state', () => {
  it('starts with empty slots, no intent, and no predictions', () => {
    const { intent, slots, predictions } = useCompositionStore.getState();
    expect(intent).toBeNull();
    expect(slots).toEqual([]);
    expect(predictions).toEqual([]);
  });
});

describe('CompositionStore — setIntent', () => {
  it('sets the intent', () => {
    useCompositionStore.getState().setIntent('I need');
    expect(useCompositionStore.getState().intent).toBe('I need');
  });
});

describe('CompositionStore — addSlot', () => {
  it('adds a slot to the slots array', () => {
    useCompositionStore.getState().addSlot('coffee');
    expect(useCompositionStore.getState().slots).toEqual(['coffee']);
  });

  it('appends a second slot after the first', () => {
    useCompositionStore.getState().addSlot('coffee');
    useCompositionStore.getState().addSlot('now');
    expect(useCompositionStore.getState().slots).toEqual(['coffee', 'now']);
  });
});

describe('CompositionStore — undoSlot / redoSlot', () => {
  it('undoSlot removes the last slot and pushes it onto undoStack', () => {
    useCompositionStore.getState().addSlot('coffee');
    useCompositionStore.getState().addSlot('now');
    useCompositionStore.getState().undoSlot();
    const { slots, undoStack } = useCompositionStore.getState();
    expect(slots).toEqual(['coffee']);
    expect(undoStack).toEqual(['now']);
  });

  it('redoSlot pops from undoStack and appends to slots', () => {
    useCompositionStore.getState().addSlot('coffee');
    useCompositionStore.getState().addSlot('now');
    useCompositionStore.getState().undoSlot(); // undo 'now'
    useCompositionStore.getState().redoSlot(); // redo 'now'
    const { slots, undoStack } = useCompositionStore.getState();
    expect(slots).toEqual(['coffee', 'now']);
    expect(undoStack).toEqual([]);
  });

  it('undoSlot when empty does nothing', () => {
    useCompositionStore.getState().undoSlot();
    const { slots, undoStack } = useCompositionStore.getState();
    expect(slots).toEqual([]);
    expect(undoStack).toEqual([]);
  });

  it('redoSlot when undoStack is empty does nothing', () => {
    useCompositionStore.getState().addSlot('coffee');
    useCompositionStore.getState().redoSlot(); // nothing to redo
    const { slots } = useCompositionStore.getState();
    expect(slots).toEqual(['coffee']);
  });
});

describe('CompositionStore — getPhrase', () => {
  it('returns intent + slots joined with spaces', () => {
    useCompositionStore.getState().setIntent('I need');
    useCompositionStore.getState().addSlot('coffee');
    useCompositionStore.getState().addSlot('now');
    expect(useCompositionStore.getState().getPhrase()).toBe('I need coffee now');
  });

  it('returns just slots joined when there is no intent', () => {
    useCompositionStore.getState().addSlot('coffee');
    useCompositionStore.getState().addSlot('please');
    expect(useCompositionStore.getState().getPhrase()).toBe('coffee please');
  });
});

describe('CompositionStore — reset', () => {
  it('clears everything and generates a new sessionId', () => {
    const originalSessionId = useCompositionStore.getState().sessionId;
    useCompositionStore.getState().setIntent('I need');
    useCompositionStore.getState().addSlot('coffee');
    useCompositionStore.getState().reset();
    const { intent, slots, undoStack, predictions, events, sessionId } = useCompositionStore.getState();
    expect(intent).toBeNull();
    expect(slots).toEqual([]);
    expect(undoStack).toEqual([]);
    expect(predictions).toEqual([]);
    expect(events).toEqual([]);
    // reset must generate a fresh session id
    expect(sessionId).not.toBe(originalSessionId);
  });
});

describe('CompositionStore — addEvent', () => {
  it('appends a SessionStep to the events array', () => {
    const event: SessionStep = {
      action: 'select',
      item_text: 'coffee',
      item_type: 'prediction',
      item_rank: 1,
      phrase_state: 'I need coffee',
      timestamp_ms: Date.now(),
    };
    useCompositionStore.getState().addEvent(event);
    const { events } = useCompositionStore.getState();
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(event);
  });
});
