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
import type { SessionStep, ComposeItem, PredictionHistoryEntry } from '../types';

const mockPredictions: ComposeItem[] = [
  { id: '1', text: 'water', itemType: 'prediction', rank: 0 },
  { id: '2', text: 'help', itemType: 'prediction', rank: 1 },
];

const mockPredictions2: ComposeItem[] = [
  { id: '3', text: 'cold', itemType: 'prediction', rank: 0 },
  { id: '4', text: 'hot', itemType: 'prediction', rank: 1 },
];

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

describe('CompositionStore — preload', () => {
  it('sets intent and predictions without resetting sessionId', () => {
    const originalId = useCompositionStore.getState().sessionId;
    useCompositionStore.getState().preload('I need', mockPredictions);
    const { intent, predictions, sessionId } = useCompositionStore.getState();
    expect(intent).toBe('I need');
    expect(predictions).toEqual(mockPredictions);
    expect(sessionId).toBe(originalId);
  });
});

describe('CompositionStore — advance (right swipe)', () => {
  it('pushes current predictions to history, adds slot, and sets new predictions', () => {
    useCompositionStore.getState().setIntent('I need');
    useCompositionStore.getState().setPredictions(mockPredictions);
    useCompositionStore.getState().advance('water', mockPredictions2);
    const { slots, predictions, predictionHistory } = useCompositionStore.getState();
    expect(slots).toEqual(['water']);
    expect(predictions).toEqual(mockPredictions2);
    expect(predictionHistory).toHaveLength(1);
    expect(predictionHistory[0].slot).toBe('water');
    expect(predictionHistory[0].predictions).toEqual(mockPredictions);
  });
});

describe('CompositionStore — backtrack (left swipe with history)', () => {
  it('pops prediction history and removes last slot', () => {
    useCompositionStore.getState().setIntent('I need');
    useCompositionStore.getState().setPredictions(mockPredictions);
    useCompositionStore.getState().advance('water', mockPredictions2);
    useCompositionStore.getState().backtrack();
    const { slots, predictions, predictionHistory } = useCompositionStore.getState();
    expect(slots).toEqual([]);
    expect(predictions).toEqual(mockPredictions);
    expect(predictionHistory).toHaveLength(0);
  });

  it('does nothing when history is empty', () => {
    useCompositionStore.getState().setIntent('I need');
    useCompositionStore.getState().setPredictions(mockPredictions);
    const result = useCompositionStore.getState().backtrack();
    expect(result).toBe(false);
    expect(useCompositionStore.getState().predictions).toEqual(mockPredictions);
  });
});

describe('CompositionStore — recordTriedPath', () => {
  it('adds a path to triedPaths', () => {
    useCompositionStore.getState().recordTriedPath(['I need', 'water', 'cold']);
    expect(useCompositionStore.getState().triedPaths).toEqual([['I need', 'water', 'cold']]);
  });
});

describe('CompositionStore — modifier cycling', () => {
  it('setModifiers sets modifier state for a target item', () => {
    useCompositionStore.getState().setModifiers('coffee', ['and', 'or', 'with']);
    const { modifierState } = useCompositionStore.getState();
    expect(modifierState).toEqual({ targetItem: 'coffee', modifiers: ['and', 'or', 'with'], currentIndex: 0 });
  });

  it('cycleModifier advances to next modifier and loops', () => {
    useCompositionStore.getState().setModifiers('coffee', ['and', 'or', 'with']);
    useCompositionStore.getState().cycleModifier();
    expect(useCompositionStore.getState().modifierState!.currentIndex).toBe(1);
    useCompositionStore.getState().cycleModifier();
    expect(useCompositionStore.getState().modifierState!.currentIndex).toBe(2);
    useCompositionStore.getState().cycleModifier();
    expect(useCompositionStore.getState().modifierState!.currentIndex).toBe(0);
  });

  it('clearModifier resets modifier state to null', () => {
    useCompositionStore.getState().setModifiers('coffee', ['and', 'or']);
    useCompositionStore.getState().clearModifier();
    expect(useCompositionStore.getState().modifierState).toBeNull();
  });

  it('getDisplayText returns item + current modifier', () => {
    useCompositionStore.getState().setModifiers('coffee', ['and', 'or']);
    expect(useCompositionStore.getState().getModifierDisplayText()).toBe('coffee and');
    useCompositionStore.getState().cycleModifier();
    expect(useCompositionStore.getState().getModifierDisplayText()).toBe('coffee or');
  });

  it('getModifierDisplayText returns null when no modifier active', () => {
    expect(useCompositionStore.getState().getModifierDisplayText()).toBeNull();
  });
});

describe('CompositionStore — preloadSavedPhrase', () => {
  it('sets intent to null and slots to full phrase text', () => {
    useCompositionStore.getState().preloadSavedPhrase('My name is Amanda');
    const { intent, slots } = useCompositionStore.getState();
    expect(intent).toBeNull();
    expect(slots).toEqual(['My name is Amanda']);
    expect(useCompositionStore.getState().getPhrase()).toBe('My name is Amanda');
  });
});

describe('CompositionStore — preloadCommonItem', () => {
  it('sets the value as first slot with no intent and isLoading true', () => {
    useCompositionStore.getState().preloadCommonItem('March 24');
    const { intent, slots, isLoading } = useCompositionStore.getState();
    expect(intent).toBeNull();
    expect(slots).toEqual(['March 24']);
    expect(isLoading).toBe(true);
  });
});

describe('CompositionStore — reset clears new fields', () => {
  it('clears predictionHistory, triedPaths, and modifierState on reset', () => {
    useCompositionStore.getState().setModifiers('coffee', ['and']);
    useCompositionStore.getState().recordTriedPath(['I need', 'water']);
    useCompositionStore.getState().reset();
    const { predictionHistory, triedPaths, modifierState } = useCompositionStore.getState();
    expect(predictionHistory).toEqual([]);
    expect(triedPaths).toEqual([]);
    expect(modifierState).toBeNull();
  });
});
