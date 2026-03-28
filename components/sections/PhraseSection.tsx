import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GestureArea } from '../gestures/GestureArea';
import { useCompositionStore } from '../../stores/composition';
import type { GestureAction } from '../../types';
import { LAYOUT, TYPOGRAPHY } from '../../constants/config';

interface PhraseSectionProps {
  onNavigateUp: () => void;
  onSave: () => void;
  onSpeak?: () => void;
  onLongPress?: () => void;
}

export function PhraseSection({ onNavigateUp, onSave, onSpeak, onLongPress }: PhraseSectionProps) {
  const phrase = useCompositionStore((s) => s.getPhrase());
  const undoSlot = useCompositionStore((s) => s.undoSlot);
  const redoSlot = useCompositionStore((s) => s.redoSlot);
  const addEvent = useCompositionStore((s) => s.addEvent);
  const startedAt = useCompositionStore((s) => s.startedAt);

  const handleAction = (action: GestureAction) => {
    switch (action.type) {
      case 'swipe':
        switch (action.direction) {
          case 'down': onNavigateUp(); break;  // Swipe down = focus moves up to compose
          case 'up': onSave(); break;           // Swipe up = focus moves down = save
          case 'right':
            undoSlot();
            addEvent({
              action: 'undo', item_text: null, item_type: null,
              item_rank: null, phrase_state: useCompositionStore.getState().getPhrase(),
              timestamp_ms: Date.now() - startedAt,
            });
            break;
          case 'left':
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
        if (phrase && onSpeak) {
          onSpeak();
        }
        break;
      case 'long-press':
        onLongPress?.();
        break;
    }
  };

  return (
    <GestureArea onAction={handleAction} config={{ swipeThresholdPx: 30 }} style={styles.container}>
      <Text style={styles.label}>Phrase</Text>
      <Text style={styles.phrase} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6}>
        {phrase || 'Start composing...'}
      </Text>
    </GestureArea>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: LAYOUT.phraseBarHeight + 20,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 2,
    borderTopColor: '#2B7A78',
    justifyContent: 'center',
    paddingHorizontal: LAYOUT.screenPadding,
    paddingVertical: 12,
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
