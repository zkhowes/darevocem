import { create } from 'zustand';
import type { FocusSection } from '../types';

interface FocusStore {
  section: FocusSection;
  composeIndex: number;
  composeListSize: number;
  previousComposeIndex: number;

  setComposeListSize: (size: number) => void;
  moveDown: () => void;
  moveUp: () => void;
  setSection: (section: FocusSection, index?: number) => void;
  setComposeIndex: (index: number) => void;
  reset: () => void;
}

export const useFocusStore = create<FocusStore>((set, get) => ({
  section: 'compose' as FocusSection,
  composeIndex: 0,
  composeListSize: 0,
  previousComposeIndex: 0,

  setComposeListSize: (size) => set({ composeListSize: size }),

  moveDown: () => {
    const { section, composeIndex, composeListSize } = get();
    if (section === 'intent') {
      set({ section: 'compose', composeIndex: 0 });
    } else if (section === 'compose') {
      if (composeIndex < composeListSize - 1) {
        set({ composeIndex: composeIndex + 1 });
      } else {
        // Reached end of compose list — move to phrase bar, remember position for moveUp
        set({ section: 'phrase', previousComposeIndex: composeIndex });
      }
    }
    // phrase + moveDown = speak/save — handled by the screen, not the focus store
  },

  moveUp: () => {
    const { section, composeIndex, previousComposeIndex } = get();
    if (section === 'phrase') {
      // Restore the compose index we were at before entering phrase
      set({ section: 'compose', composeIndex: previousComposeIndex });
    } else if (section === 'compose') {
      if (composeIndex > 0) {
        set({ composeIndex: composeIndex - 1 });
      }
      // At index 0 + moveUp: screen handles (expand intent bar or navigate home)
    }
    // intent + moveUp = navigate home — handled by the screen, not the focus store
  },

  setSection: (section, index) => set({
    section,
    composeIndex: index ?? 0,
  }),

  setComposeIndex: (index) => set({ composeIndex: index }),

  reset: () => set({
    section: 'compose',
    composeIndex: 0,
    previousComposeIndex: 0,
  }),
}));
