import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateId } from '../types';
import type { ComposeItem, SessionStep, PredictionHistoryEntry, ModifierState } from '../types';

// Compose screen has two modes:
// - 'predict': AI predicts next words to append (entered from predicted intents or record)
// - 'phrase': shows full common/saved phrases to select (entered from common/saved)
export type ComposeMode = 'predict' | 'phrase';
// What type of phrases to show in phrase mode
export type PhraseSource = 'common' | 'saved';

interface CompositionStore {
  sessionId: string;
  intent: string | null;
  intentCycleCount: number;
  slots: string[];
  undoStack: string[];
  predictions: ComposeItem[];
  isLoading: boolean;
  startedAt: number;
  events: SessionStep[];

  // Compose mode state
  composeMode: ComposeMode;
  phraseSource: PhraseSource | null;

  predictionHistory: PredictionHistoryEntry[];
  triedItems: string[];
  modifierState: ModifierState | null;
  refinementQueue: ComposeItem[];
  refinementQueueIndex: number | null;

  isIntentEditable: () => boolean;
  setIntent: (intent: string) => void;
  incrementIntentCycleCount: () => void;
  addSlot: (text: string) => void;
  undoSlot: () => void;
  redoSlot: () => void;
  setPredictions: (predictions: ComposeItem[]) => void;
  setLoading: (loading: boolean) => void;
  addEvent: (event: SessionStep) => void;
  getPhrase: () => string;
  reset: () => void;

  preload: (intent: string, predictions: ComposeItem[]) => void;
  preloadSavedPhrase: (text: string) => void;
  preloadCommonItem: (value: string) => void;
  preloadPhraseMode: (text: string, source: PhraseSource) => void;
  switchToPredictMode: () => void;
  advance: (selectedText: string, nextPredictions: ComposeItem[]) => void;
  refine: (targetIndex: number, replacement: ComposeItem, queue: ComposeItem[]) => void;
  backtrack: () => boolean;
  recordTriedItem: (item: string) => void;
  clearTriedItems: () => void;
  setModifiers: (targetItem: string, modifiers: string[]) => void;
  cycleModifier: () => void;
  clearModifier: () => void;
  getModifierDisplayText: () => string | null;
}

export const useCompositionStore = create<CompositionStore>()(
  persist(
    (set, get) => ({
      sessionId: generateId(),
      intent: null,
      intentCycleCount: 0,
      slots: [],
      undoStack: [],
      predictions: [],
      isLoading: false,
      startedAt: Date.now(),
      events: [],
      composeMode: 'predict' as ComposeMode,
      phraseSource: null,
      predictionHistory: [],
      triedItems: [],
      modifierState: null,
      refinementQueue: [],
      refinementQueueIndex: null,

      // Intent is editable until a word has been added to the phrase.
      // Once slots > 0, intent is locked to prevent breaking the sentence.
      // User can swipe right on phrase bar to undo all slots, making intent editable again.
      isIntentEditable: () => get().slots.length === 0,

      setIntent: (intent) => set({ intent, intentCycleCount: 0 }),

      incrementIntentCycleCount: () => set((s) => ({
        intentCycleCount: s.intentCycleCount + 1,
      })),

      addSlot: (text) => set((s) => ({
        slots: [...s.slots, text],
        // New selection clears the redo stack — branched history is discarded
        undoStack: [],
      })),

      undoSlot: () => {
        const { slots } = get();
        if (slots.length === 0) return;
        const removed = slots[slots.length - 1];
        set((s) => ({
          slots: s.slots.slice(0, -1),
          undoStack: [...s.undoStack, removed],
        }));
      },

      redoSlot: () => {
        const { undoStack } = get();
        if (undoStack.length === 0) return;
        const restored = undoStack[undoStack.length - 1];
        set((s) => ({
          slots: [...s.slots, restored],
          undoStack: s.undoStack.slice(0, -1),
        }));
      },

      setPredictions: (predictions) => set({ predictions }),
      setLoading: (isLoading) => set({ isLoading }),

      addEvent: (event) => set((s) => ({
        events: [...s.events, event],
      })),

      getPhrase: () => {
        const { intent, slots } = get();
        const parts = intent ? [intent, ...slots] : slots;
        return parts.join(' ');
      },

      // Preload intent + initial predictions from the home screen before navigating to compose.
      // Preserves sessionId so crash recovery still works.
      preload: (intent, predictions) => set({
        intent,
        predictions,
        isLoading: false,
        slots: [],
        undoStack: [],
        predictionHistory: [],
        triedItems: [],
        modifierState: null,
        composeMode: 'predict' as ComposeMode,
        phraseSource: null,
      }),

      // Preload a saved phrase as a single complete slot (no intent, ready to speak).
      preloadSavedPhrase: (text) => set({
        intent: null,
        slots: [text],
        predictions: [],
        isLoading: false,
        undoStack: [],
        predictionHistory: [],
        triedItems: [],
        modifierState: null,
        composeMode: 'phrase' as ComposeMode,
        phraseSource: 'saved' as PhraseSource,
      }),

      // Preload a common item as the first slot (no intent, loading for next predictions).
      preloadCommonItem: (value) => set({
        intent: null,
        slots: [value],
        isLoading: true,
        undoStack: [],
        predictionHistory: [],
        triedItems: [],
        modifierState: null,
        composeMode: 'predict' as ComposeMode,
        phraseSource: null,
      }),

      // Preload for phrase mode — shows the selected phrase in intent/phrase bar,
      // compose section shows more common/saved phrases to quickly swap to.
      preloadPhraseMode: (text, source) => set({
        intent: text,
        slots: [],
        predictions: [],
        isLoading: true,
        undoStack: [],
        predictionHistory: [],
        triedItems: [],
        modifierState: null,
        composeMode: 'phrase' as ComposeMode,
        phraseSource: source,
      }),

      // Switch from phrase mode to predict mode. Keeps current phrase,
      // starts appending AI predictions to it.
      switchToPredictMode: () => {
        const { intent, slots } = get();
        // Move the intent text into slots so predictions append after it
        const currentPhrase = intent ? [intent, ...slots] : [...slots];
        set({
          intent: currentPhrase[0] ?? null,
          slots: currentPhrase.slice(1),
          composeMode: 'predict' as ComposeMode,
          phraseSource: null,
          predictions: [],
          isLoading: true,
          predictionHistory: [],
          triedItems: [],
          modifierState: null,
        });
      },

      // Double-tap: select a word, add to phrase, replace predictions. Pushes history for backtrack.
      advance: (selectedText, nextPredictions) => set((s) => ({
        slots: [...s.slots, selectedText],
        predictionHistory: [...s.predictionHistory, {
          predictions: s.predictions,
          slot: selectedText,
          source: 'advance',
        }],
        predictions: nextPredictions,
        undoStack: [],
        modifierState: null,
        refinementQueue: [],
        refinementQueueIndex: null,
      })),

      // Swap a single prediction at targetIndex. Remaining alternatives are cached
      // in refinementQueue so the next swipe-left on the same position is instant.
      refine: (targetIndex, replacement, queue) => {
        const current = get().predictions;
        if (current.length === 0 || targetIndex >= current.length) return;
        const oldItem = current[targetIndex];
        if (oldItem.text === replacement.text) return;

        const newPredictions = [...current];
        newPredictions[targetIndex] = replacement;

        set((s) => ({
          predictionHistory: [...s.predictionHistory, {
            predictions: s.predictions,
            slot: oldItem.text,
            source: 'refine',
          }],
          predictions: newPredictions,
          refinementQueue: queue,
          refinementQueueIndex: targetIndex,
          modifierState: null,
        }));
      },

      // Left swipe: undo last history entry, restore the predictions that were shown.
      // Only removes a slot if the entry was from an advance (which added a slot).
      // Refine entries only swap predictions — no slot to remove.
      backtrack: () => {
        const { predictionHistory, slots } = get();
        if (predictionHistory.length === 0) return false;
        const previous = predictionHistory[predictionHistory.length - 1];
        set({
          predictions: previous.predictions,
          // Only remove a slot if the history entry added one
          slots: previous.source === 'advance' ? slots.slice(0, -1) : slots,
          predictionHistory: predictionHistory.slice(0, -1),
          modifierState: null,
          refinementQueue: [],
          refinementQueueIndex: null,
        });
        return true;
      },

      // Record a single item the user rejected (swipe-left), so predictions avoid it.
      recordTriedItem: (item) => set((s) => ({
        triedItems: s.triedItems.includes(item) ? s.triedItems : [...s.triedItems, item],
      })),

      // Clear tried items — called when a new word is selected (fresh prediction space).
      clearTriedItems: () => set({ triedItems: [] }),

      // Begin modifier cycling for the focused item (single tap on a slot).
      setModifiers: (targetItem, modifiers) => set({
        modifierState: { targetItem, modifiers, currentIndex: 0 },
      }),

      // Advance to next modifier. After cycling through all, return to no modifier.
      // Next tap will start fresh from index 0 via setModifiers.
      cycleModifier: () => {
        const { modifierState } = get();
        if (!modifierState) return;
        const nextIndex = modifierState.currentIndex + 1;
        if (nextIndex >= modifierState.modifiers.length) {
          // Cycled through all modifiers — return to base word (no modifier)
          set({ modifierState: null });
        } else {
          set({
            modifierState: {
              ...modifierState,
              currentIndex: nextIndex,
            },
          });
        }
      },

      clearModifier: () => set({ modifierState: null }),

      // Returns the display string for the current modifier state (e.g. "coffee and").
      getModifierDisplayText: () => {
        const { modifierState } = get();
        if (!modifierState) return null;
        return `${modifierState.targetItem} ${modifierState.modifiers[modifierState.currentIndex]}`;
      },

      reset: () => set({
        sessionId: generateId(),
        intent: null,
        intentCycleCount: 0,
        slots: [],
        undoStack: [],
        predictions: [],
        isLoading: false,
        startedAt: Date.now(),
        events: [],
        composeMode: 'predict' as ComposeMode,
        phraseSource: null,
        predictionHistory: [],
        triedItems: [],
        modifierState: null,
        refinementQueue: [],
        refinementQueueIndex: null,
      }),
    }),
    {
      name: 'darevocem-composition',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist critical state for crash recovery — ephemeral UI state is not saved
      partialize: (state) => ({
        sessionId: state.sessionId,
        intent: state.intent,
        slots: state.slots,
        startedAt: state.startedAt,
        predictionHistory: state.predictionHistory,
      }),
    },
  ),
);
