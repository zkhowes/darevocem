import React, { useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { WheelPicker } from '../shared/WheelPicker';
import { useFocusStore } from '../../stores/focus';
import { useCompositionStore } from '../../stores/composition';
import { usePreferencesStore } from '../../stores/preferences';
import { speakPreview, cancelPreview } from '../../services/auditoryPreview';
import { getWordTypeColor } from '../../constants/fitzgerald';
import { LAYOUT, TYPOGRAPHY } from '../../constants/config';
import type { GestureAction, ComposeItem, WheelPickerItem, WordType } from '../../types';

interface ComposeSectionProps {
  onAdvance: (item: ComposeItem) => void;
  onBacktrack: () => void;
  onModifierTap: (item: ComposeItem) => void;
  onSelect: (item: ComposeItem) => void;
  onLongPress?: () => void;
  onRefresh?: () => void;
}

export function ComposeSection({ onAdvance, onBacktrack, onModifierTap, onSelect, onLongPress, onRefresh }: ComposeSectionProps) {
  const predictions = useCompositionStore((s) => s.predictions);
  const isLoading = useCompositionStore((s) => s.isLoading);
  const addSlot = useCompositionStore((s) => s.addSlot);
  const addEvent = useCompositionStore((s) => s.addEvent);
  const modifierState = useCompositionStore((s) => s.modifierState);

  const composeIndex = useFocusStore((s) => s.composeIndex);
  const setComposeIndex = useFocusStore((s) => s.setComposeIndex);
  const setComposeListSize = useFocusStore((s) => s.setComposeListSize);
  const section = useFocusStore((s) => s.section);
  const moveDown = useFocusStore((s) => s.moveDown);

  React.useEffect(() => {
    const count = displayDensity === 'simplified'
      ? Math.min(predictions.length, 3)
      : predictions.length;
    setComposeListSize(count);
  }, [predictions.length, displayDensity]);

  const auditoryPreview = usePreferencesStore((s) => s.auditoryPreview);
  const displayDensity = usePreferencesStore((s) => s.displayDensity);

  // Convert ComposeItems to WheelPickerItems.
  // When a wordType is present (from Claude), use Fitzgerald Key colors.
  // Otherwise fall back to the original item-type colors.
  const wheelItems: WheelPickerItem[] = predictions.map((p) => {
    const wordType = p.wordType as WordType | undefined;
    let color: string;
    if (wordType) {
      color = getWordTypeColor(wordType);
    } else if (p.itemType === 'common') {
      color = '#2B7A78';
    } else if (p.itemType === 'saved') {
      color = '#7B68AE';
    } else {
      color = '#E07B2E';
    }
    return {
      id: p.id,
      text: p.text,
      itemType: p.itemType === 'recent' ? 'prediction' : p.itemType,
      color,
      metadata: { rank: p.rank, value: p.value, label: p.label, wordType },
    };
  });

  const handleFocusChange = useCallback((index: number) => {
    setComposeIndex(index);
    useCompositionStore.getState().clearModifier();

    // Auditory preview: speak the newly focused item so the user
    // knows what they're on without needing to read the text.
    if (auditoryPreview && predictions[index]) {
      speakPreview(predictions[index].text);
    }
  }, [setComposeIndex, auditoryPreview, predictions]);

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
            case 'left':
              // Refine: push history for backtracking, fetch similar alternatives.
              // Does NOT add to phrase — the user is saying "close but not right."
              onAdvance(prediction);
              logEvent('refine');
              break;
            case 'right': {
              // If a modifier is active, clear it first (undo the modifier)
              const compState = useCompositionStore.getState();
              if (compState.modifierState && compState.modifierState.targetItem === prediction.text) {
                compState.clearModifier();
                logEvent('modify');
                break;
              }
              // Backtrack: pop prediction history or fetch divergent predictions.
              // When history is empty, fetches divergent predictions (new path).
              onBacktrack();
              logEvent('reject');
              break;
            }
            case 'up':
              // Swipe up at last item → move focus down to phrase bar
              if (index === predictions.length - 1) {
                moveDown();
              }
              break;
            case 'down':
              // Swipe down at first item → move focus up to intent
              // (handled by WheelPicker returning gesture when index === 0)
              break;
          }
          break;
        case 'double-tap': {
          // Cancel any auditory preview — user has committed a selection
          cancelPreview();
          // Select item, add to phrase, fetch next predictions.
          // Unlike left-swipe (advance), this does NOT push prediction history,
          // so right-swipe won't backtrack through double-tap selections.
          onSelect(prediction);
          logEvent('select');
          break;
        }
        case 'tap':
          onModifierTap(prediction);
          break;
        case 'long-press':
          onLongPress?.();
          break;
      }
    },
    [section, predictions, onAdvance, onBacktrack, onModifierTap, onSelect, addSlot, addEvent, moveDown],
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

  // Simplified mode: limit visible items for bad days / cognitive overload.
  // Same layout structure, fewer items, bigger targets.
  const visibleItems = displayDensity === 'simplified'
    ? wheelItems.slice(0, 3)
    : wheelItems;

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
    <View style={styles.wrapper}>
      <WheelPicker
        items={visibleItems}
        focusedIndex={composeIndex}
        onFocusChange={handleFocusChange}
        onGesture={handleGesture}
        renderItem={renderItem}
      />
      {onRefresh && (
        <Pressable style={styles.refreshButton} onPress={onRefresh}>
          <Text style={styles.refreshIcon}>↻</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  refreshButton: {
    position: 'absolute',
    bottom: 8,
    right: LAYOUT.screenPadding,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E5E5E0',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  refreshIcon: {
    fontSize: 20,
    color: '#6B6B6B',
    fontWeight: '700',
  },
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
