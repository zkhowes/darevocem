import React, { useEffect } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { GestureArea } from '../gestures/GestureArea';
import { FocusIndicator } from '../shared/FocusIndicator';
import { useFocusStore } from '../../stores/focus';
import { useCompositionStore } from '../../stores/composition';
import type { GestureAction, ComposeItem } from '../../types';
import { LAYOUT, TYPOGRAPHY } from '../../constants/config';

interface ComposeSectionProps {
  onRefine: (item: ComposeItem) => void;
  onModify: (item: ComposeItem) => void;
}

export function ComposeSection({ onRefine, onModify }: ComposeSectionProps) {
  const predictions = useCompositionStore((s) => s.predictions);
  const isLoading = useCompositionStore((s) => s.isLoading);
  const addSlot = useCompositionStore((s) => s.addSlot);
  const addEvent = useCompositionStore((s) => s.addEvent);

  const composeIndex = useFocusStore((s) => s.composeIndex);
  const moveDown = useFocusStore((s) => s.moveDown);
  const moveUp = useFocusStore((s) => s.moveUp);
  const setComposeListSize = useFocusStore((s) => s.setComposeListSize);
  const section = useFocusStore((s) => s.section);

  // Keep focus store in sync with the current prediction list size
  useEffect(() => {
    setComposeListSize(predictions.length);
  }, [predictions.length]);

  const handleItemAction = (action: GestureAction, item: ComposeItem, index: number) => {
    // Only handle gestures when this section is focused
    if (section !== 'compose') return;

    switch (action.type) {
      case 'swipe':
        switch (action.direction) {
          case 'down': moveDown(); break;
          case 'up': moveUp(); break;
          case 'right':
            // Swipe right = refine — open the modifier/refinement flow for this item
            onRefine(item);
            addEvent({
              action: 'refine',
              item_text: item.text,
              item_type: item.itemType,
              item_rank: index,
              phrase_state: useCompositionStore.getState().getPhrase(),
              timestamp_ms: Date.now() - useCompositionStore.getState().startedAt,
            });
            break;
          case 'left': {
            // Swipe left = reject — remove this prediction from the list
            const newPredictions = predictions.filter((_, i) => i !== index);
            useCompositionStore.getState().setPredictions(newPredictions);
            addEvent({
              action: 'reject',
              item_text: item.text,
              item_type: item.itemType,
              item_rank: index,
              phrase_state: useCompositionStore.getState().getPhrase(),
              timestamp_ms: Date.now() - useCompositionStore.getState().startedAt,
            });
            break;
          }
        }
        break;
      case 'double-tap':
        // Double-tap = select — add this word/phrase to the composition
        addSlot(item.value ?? item.text);
        addEvent({
          action: 'select',
          item_text: item.text,
          item_type: item.itemType,
          item_rank: index,
          phrase_state: useCompositionStore.getState().getPhrase(),
          timestamp_ms: Date.now() - useCompositionStore.getState().startedAt,
        });
        break;
      case 'tap':
        // Single tap = modify — open the keyboard/edit flow for this item
        onModify(item);
        break;
      case 'long-press':
        // Context menu (Task 15)
        break;
    }
  };

  const renderItem = ({ item, index }: { item: ComposeItem; index: number }) => (
    <GestureArea
      onAction={(action) => handleItemAction(action, item, index)}
      style={styles.itemWrapper}
    >
      <FocusIndicator
        isFocused={section === 'compose' && composeIndex === index}
        isTopPrediction={index === 0 && item.itemType === 'prediction'}
        style={styles.item}
      >
        {/* Short type label (P = prediction, C = common, R = recent) + 1-based rank */}
        <Text style={styles.itemLabel}>
          {item.itemType === 'prediction' ? 'P' : item.itemType === 'common' ? 'C' : 'R'}
          {index + 1}:{' '}
        </Text>
        <Text style={styles.itemText}>{item.text}</Text>
      </FocusIndicator>
    </GestureArea>
  );

  // Shimmer skeleton while predictions are loading
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.item, styles.shimmer]} />
        ))}
      </View>
    );
  }

  return (
    <FlatList
      data={predictions}
      renderItem={renderItem}
      keyExtractor={(item) => item.id}
      scrollEnabled={false}
      contentContainerStyle={styles.list}
    />
  );
}

const styles = StyleSheet.create({
  list: { gap: LAYOUT.itemGap },
  itemWrapper: {},
  item: {
    minHeight: LAYOUT.listItemHeight,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    justifyContent: 'center',
    paddingHorizontal: LAYOUT.screenPadding,
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemLabel: {
    fontSize: TYPOGRAPHY.itemLabel.size,
    color: '#6B6B6B',
    marginRight: 4,
  },
  itemText: {
    fontSize: TYPOGRAPHY.listItem.size,
    fontWeight: TYPOGRAPHY.listItem.weight,
    color: '#1A1A1A',
    flex: 1,
  },
  loadingContainer: { gap: LAYOUT.itemGap },
  shimmer: {
    minHeight: LAYOUT.listItemHeight,
    backgroundColor: '#D5D5D0',
    borderRadius: 8,
  },
});
