import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateId } from '../types';
import type { ComposeItem, SessionStep } from '../types';

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
      }),
    },
  ),
);
