import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GestureArea } from '../gestures/GestureArea';
import { useCompositionStore } from '../../stores/composition';
import type { GestureAction } from '../../types';
import { LAYOUT, TYPOGRAPHY } from '../../constants/config';

interface PhraseSectionProps {
  onNavigateUp: () => void;
  onSave: () => void;
}

export function PhraseSection({ onNavigateUp, onSave }: PhraseSectionProps) {
  const phrase = useCompositionStore((s) => s.getPhrase());
  const undoSlot = useCompositionStore((s) => s.undoSlot);
  const redoSlot = useCompositionStore((s) => s.redoSlot);
  const addEvent = useCompositionStore((s) => s.addEvent);
  const startedAt = useCompositionStore((s) => s.startedAt);

  const handleAction = (action: GestureAction) => {
    switch (action.type) {
      case 'swipe':
        switch (action.direction) {
          case 'up': onNavigateUp(); break;
          case 'down': onSave(); break;
          case 'left':
            undoSlot();
            addEvent({
              action: 'undo', item_text: null, item_type: null,
              item_rank: null, phrase_state: useCompositionStore.getState().getPhrase(),
              timestamp_ms: Date.now() - startedAt,
            });
            break;
          case 'right':
            redoSlot();
            addEvent({
              action: 'redo', item_text: null, item_type: null,
              item_rank: null, phrase_state: useCompositionStore.getState().getPhrase(),
              timestamp_ms: Date.now() - startedAt,
            });
            break;
        }
        break;
      case 'double-tap':
        // MVP 1.1: speak phrase
        break;
      case 'long-press':
        // Context menu: "speak imperfect", save
        break;
    }
  };

  return (
    <GestureArea onAction={handleAction} style={styles.container}>
      <Text style={styles.label}>Phrase</Text>
      <Text style={styles.phrase} numberOfLines={2}>
        {phrase || 'Start composing...'}
      </Text>
    </GestureArea>
  );
}

const styles = StyleSheet.create({
  container: {
    height: LAYOUT.phraseBarHeight,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 2,
    borderTopColor: '#2B7A78',
    justifyContent: 'center',
    paddingHorizontal: LAYOUT.screenPadding,
  },
  label: {
    fontSize: TYPOGRAPHY.itemLabel.size,
    color: '#6B6B6B',
  },
  phrase: {
    fontSize: TYPOGRAPHY.phraseBar.size,
    fontWeight: TYPOGRAPHY.phraseBar.weight,
    color: '#1A1A1A',
  },
});
