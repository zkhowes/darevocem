import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateId } from '../types';
import type { ComposeItem, SessionStep, PredictionHistoryEntry, ModifierState } from '../types';

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

  predictionHistory: PredictionHistoryEntry[];
  triedPaths: string[][];
  modifierState: ModifierState | null;

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
  advance: (selectedText: string, nextPredictions: ComposeItem[]) => void;
  backtrack: () => boolean;
  recordTriedPath: (path: string[]) => void;
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
      predictionHistory: [],
      triedPaths: [],
      modifierState: null,

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
        triedPaths: [],
        modifierState: null,
      }),

      // Preload a saved phrase as a single complete slot (no intent, ready to speak).
      preloadSavedPhrase: (text) => set({
        intent: null,
        slots: [text],
        predictions: [],
        isLoading: false,
        undoStack: [],
        predictionHistory: [],
        triedPaths: [],
        modifierState: null,
      }),

      // Preload a common item as the first slot (no intent, loading for next predictions).
      preloadCommonItem: (value) => set({
        intent: null,
        slots: [value],
        isLoading: true,
        undoStack: [],
        predictionHistory: [],
        triedPaths: [],
        modifierState: null,
      }),

      // Right swipe: confirm the focused prediction, push it onto slots, save history for backtrack.
      advance: (selectedText, nextPredictions) => set((s) => ({
        slots: [...s.slots, selectedText],
        predictionHistory: [...s.predictionHistory, {
          predictions: s.predictions,
          slot: selectedText,
        }],
        predictions: nextPredictions,
        undoStack: [],
        modifierState: null,
      })),

      // Left swipe: undo last advance, restore the predictions that were shown at that point.
      backtrack: () => {
        const { predictionHistory, slots } = get();
        if (predictionHistory.length === 0) return false;
        const previous = predictionHistory[predictionHistory.length - 1];
        set({
          predictions: previous.predictions,
          slots: slots.slice(0, -1),
          predictionHistory: predictionHistory.slice(0, -1),
          modifierState: null,
        });
        return true;
      },

      // Record a path that Amanda tried and rejected, so predictions can deprioritize it.
      recordTriedPath: (path) => set((s) => ({
        triedPaths: [...s.triedPaths, path],
      })),

      // Begin modifier cycling for the focused item (single tap on a slot).
      setModifiers: (targetItem, modifiers) => set({
        modifierState: { targetItem, modifiers, currentIndex: 0 },
      }),

      // Advance to next modifier, wrapping around on overflow.
      cycleModifier: () => {
        const { modifierState } = get();
        if (!modifierState) return;
        set({
          modifierState: {
            ...modifierState,
            currentIndex: (modifierState.currentIndex + 1) % modifierState.modifiers.length,
          },
        });
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
        predictionHistory: [],
        triedPaths: [],
        modifierState: null,
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
