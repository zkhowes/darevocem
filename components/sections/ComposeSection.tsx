import React, { useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { WheelPicker } from '../shared/WheelPicker';
import { useFocusStore } from '../../stores/focus';
import { useCompositionStore } from '../../stores/composition';
import { LAYOUT, TYPOGRAPHY } from '../../constants/config';
import type { GestureAction, ComposeItem, WheelPickerItem } from '../../types';

interface ComposeSectionProps {
  onAdvance: (item: ComposeItem) => void;
  onBacktrack: () => void;
  onDiverge: () => void;
  onModifierTap: (item: ComposeItem) => void;
}

export function ComposeSection({ onAdvance, onBacktrack, onDiverge, onModifierTap }: ComposeSectionProps) {
  const predictions = useCompositionStore((s) => s.predictions);
  const isLoading = useCompositionStore((s) => s.isLoading);
  const addSlot = useCompositionStore((s) => s.addSlot);
  const addEvent = useCompositionStore((s) => s.addEvent);
  const modifierState = useCompositionStore((s) => s.modifierState);
  const predictionHistory = useCompositionStore((s) => s.predictionHistory);

  const composeIndex = useFocusStore((s) => s.composeIndex);
  const setComposeIndex = useFocusStore((s) => s.setComposeIndex);
  const setComposeListSize = useFocusStore((s) => s.setComposeListSize);
  const section = useFocusStore((s) => s.section);
  const moveDown = useFocusStore((s) => s.moveDown);

  React.useEffect(() => {
    setComposeListSize(predictions.length);
  }, [predictions.length]);

  // Convert ComposeItems to WheelPickerItems
  const wheelItems: WheelPickerItem[] = predictions.map((p) => ({
    id: p.id,
    text: p.text,
    itemType: p.itemType === 'recent' ? 'prediction' : p.itemType,
    color: p.itemType === 'common' ? '#2B7A78' : p.itemType === 'saved' ? '#7B68AE' : '#E07B2E',
    metadata: { rank: p.rank, value: p.value, label: p.label },
  }));

  const handleFocusChange = useCallback((index: number) => {
    setComposeIndex(index);
    useCompositionStore.getState().clearModifier();
  }, [setComposeIndex]);

  const handleGesture = useCallback(
    (gesture: GestureAction, item: WheelPickerItem, index: number) => {
      if (section !== 'compose') return;

      const prediction = predictions[index];
      if (!prediction) return;

      const logEvent = (action: string) => {
        const state = useCompositionStore.getState();
        addEvent({
          action: action as any,
          item_text: item.text,
          item_type: prediction.itemType,
          item_rank: index,
          phrase_state: state.getPhrase(),
          timestamp_ms: Date.now() - state.startedAt,
        });
      };

      switch (gesture.type) {
        case 'swipe':
          switch (gesture.direction) {
            case 'right':
              onAdvance(prediction);
              logEvent('advance');
              break;
            case 'left':
              if (predictionHistory.length > 0) {
                onBacktrack();
                logEvent('backtrack');
              } else {
                onDiverge();
                logEvent('diverge');
              }
              break;
            case 'down':
              if (index === predictions.length - 1) {
                moveDown();
              }
              break;
          }
          break;
        case 'double-tap':
          addSlot(prediction.value ?? prediction.text);
          logEvent('select');
          break;
        case 'tap':
          onModifierTap(prediction);
          break;
        case 'long-press':
          // Context menu (future)
          break;
      }
    },
    [section, predictions, predictionHistory.length, onAdvance, onBacktrack, onDiverge, onModifierTap, addSlot, addEvent, moveDown],
  );

  const renderItem = useCallback(
    (item: WheelPickerItem, isFocused: boolean) => {
      const displayText = isFocused && modifierState && modifierState.targetItem === item.text
        ? useCompositionStore.getState().getModifierDisplayText() ?? item.text
        : item.text;

      return (
        <View style={styles.itemContent}>
          <Text style={[
            styles.itemLabel,
            isFocused && styles.focusedLabel,
          ]}>
            {item.itemType === 'prediction' ? 'P' : item.itemType === 'common' ? 'C' : 'S'}
            {(item.metadata?.rank as number ?? 0) + 1}
          </Text>
          <Text style={[
            isFocused ? styles.focusedText : styles.itemText,
          ]}>
            {displayText}
          </Text>
        </View>
      );
    },
    [modifierState],
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.shimmer} />
        ))}
      </View>
    );
  }

  return (
    <WheelPicker
      items={wheelItems}
      focusedIndex={composeIndex}
      onFocusChange={handleFocusChange}
      onGesture={handleGesture}
      renderItem={renderItem}
    />
  );
}

const styles = StyleSheet.create({
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  itemLabel: {
    fontSize: TYPOGRAPHY.itemLabel.size,
    color: '#6B6B6B',
    marginRight: 8,
  },
  focusedLabel: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  itemText: {
    fontSize: LAYOUT.wheelPickerItemFontSize,
    fontWeight: '500',
    color: '#1A1A1A',
    flex: 1,
  },
  focusedText: {
    fontSize: LAYOUT.wheelPickerFocusedFontSize,
    fontWeight: '700',
    color: '#FFFFFF',
    flex: 1,
  },
  loadingContainer: {
    gap: LAYOUT.itemGap,
    paddingHorizontal: LAYOUT.screenPadding,
  },
  shimmer: {
    height: LAYOUT.wheelPickerItemHeight,
    backgroundColor: '#D5D5D0',
    borderRadius: 12,
  },
});
