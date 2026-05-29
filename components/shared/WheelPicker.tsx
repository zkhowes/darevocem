import React, { useCallback, useRef } from 'react';
import { View, StyleSheet, FlatList, type LayoutChangeEvent } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
} from 'react-native-reanimated';
import { GestureArea } from '../gestures/GestureArea';
import { findRowAtTouchY } from '../../utils/wheelPickerTouchRouting';
import { LAYOUT, TIMING } from '../../constants/config';
import type { GestureAction, WheelPickerItem } from '../../types';

interface WheelPickerProps {
  items: WheelPickerItem[];
  focusedIndex: number;
  onFocusChange: (index: number) => void;
  onGesture: (gesture: GestureAction, item: WheelPickerItem, index: number) => void;
  renderItem: (item: WheelPickerItem, isFocused: boolean) => React.ReactNode;
}

// Pure visual component — no gesture handling.
// All gestures are captured at the list level and routed via focusedIndex.
// Each row reports its measured y/height to the parent via onLayoutReport so
// the list-level gesture handler can map a tap's touchY to the tapped row.
function WheelPickerItemView({
  item,
  index,
  isFocused,
  renderItem,
  onLayoutReport,
}: {
  item: WheelPickerItem;
  index: number;
  isFocused: boolean;
  renderItem: (item: WheelPickerItem, isFocused: boolean) => React.ReactNode;
  onLayoutReport: (index: number, layout: { y: number; height: number }) => void;
}) {
  const scale = useSharedValue(isFocused ? 1 : 0.95);
  const height = useSharedValue(
    isFocused ? LAYOUT.wheelPickerFocusedHeight : LAYOUT.wheelPickerItemHeight,
  );

  React.useEffect(() => {
    scale.value = withSpring(isFocused ? 1 : 0.95, {
      duration: TIMING.focusAnimationMs,
    });
    height.value = withSpring(
      isFocused ? LAYOUT.wheelPickerFocusedHeight : LAYOUT.wheelPickerItemHeight,
      { duration: TIMING.focusAnimationMs },
    );
  }, [isFocused]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    height: height.value,
  }));

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const { y, height: h } = e.nativeEvent.layout;
    onLayoutReport(index, { y, height: h });
  }, [index, onLayoutReport]);

  return (
    <Animated.View
      onLayout={handleLayout}
      style={[
        styles.itemContainer,
        isFocused && {
          backgroundColor: item.color,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.15,
          shadowRadius: 4,
          elevation: 3,
        },
        !isFocused && {
          backgroundColor: '#FFFFFF',
          borderLeftWidth: 4,
          borderLeftColor: item.color,
        },
        animatedStyle,
      ]}
    >
      {renderItem(item, isFocused)}
    </Animated.View>
  );
}

export function WheelPicker({
  items,
  focusedIndex,
  onFocusChange,
  onGesture,
  renderItem,
}: WheelPickerProps) {
  const flatListRef = useRef<FlatList>(null);
  // Row layout map: each WheelPickerItemView reports its measured y + height
  // here on mount/resize. The list-level gesture handler uses it to map a
  // tap's touchY to the row that was actually pressed, so a double-tap on a
  // non-focused row targets THAT row (not the focused one) — while swipes
  // and the swipe-anywhere model stay intact.
  const rowLayoutsRef = useRef<Map<number, { y: number; height: number }>>(new Map());
  const handleRowLayout = useCallback((index: number, layout: { y: number; height: number }) => {
    rowLayoutsRef.current.set(index, layout);
  }, []);

  React.useEffect(() => {
    if (flatListRef.current && items.length > 0 && focusedIndex >= 0 && focusedIndex < items.length) {
      flatListRef.current.scrollToIndex({
        index: focusedIndex,
        animated: true,
        viewPosition: 0.5,
      });
    }
  }, [focusedIndex, items.length]);

  // Single gesture handler for the entire list.
  // Vertical swipes change focus; horizontal swipes route to the focused item;
  // taps/double-taps/long-press route to the row actually under the finger
  // (falling back to the focused row if touchY can't be mapped).
  const handleListGesture = useCallback((gesture: GestureAction) => {
    if (gesture.type === 'swipe') {
      if (gesture.direction === 'up') {
        if (focusedIndex < items.length - 1) {
          onFocusChange(focusedIndex + 1);
        } else {
          // At last item — forward boundary swipe to parent
          onGesture(gesture, items[focusedIndex], focusedIndex);
        }
        return;
      }
      if (gesture.direction === 'down') {
        if (focusedIndex > 0) {
          onFocusChange(focusedIndex - 1);
        } else {
          // At first item — forward boundary swipe to parent
          onGesture(gesture, items[focusedIndex], focusedIndex);
        }
        return;
      }
      // Horizontal swipe — route to the focused item.
      if (items[focusedIndex]) {
        onGesture(gesture, items[focusedIndex], focusedIndex);
      }
      return;
    }

    // Tap / double-tap / long-press — prefer the row actually touched so
    // double-tapping P3 selects P3 (not the currently focused P1). Focus
    // intentionally does NOT shift — swipes still own focus changes.
    const touchedIndex = findRowAtTouchY(gesture.touchY, rowLayoutsRef.current);
    const targetIndex = touchedIndex != null && items[touchedIndex] ? touchedIndex : focusedIndex;
    if (items[targetIndex]) {
      onGesture(gesture, items[targetIndex], targetIndex);
    }
  }, [focusedIndex, items, onFocusChange, onGesture]);

  const renderListItem = useCallback(
    ({ item, index }: { item: WheelPickerItem; index: number }) => (
      <WheelPickerItemView
        item={item}
        index={index}
        isFocused={index === focusedIndex}
        renderItem={renderItem}
        onLayoutReport={handleRowLayout}
      />
    ),
    [focusedIndex, renderItem, handleRowLayout],
  );

  const getItemLayout = useCallback(
    (_data: ArrayLike<WheelPickerItem> | null | undefined, index: number) => {
      const itemHeight = LAYOUT.wheelPickerItemHeight + LAYOUT.itemGap;
      return {
        length: itemHeight,
        offset: itemHeight * index,
        index,
      };
    },
    [],
  );

  return (
    <GestureArea onAction={handleListGesture} style={styles.listGestureWrapper}>
      <FlatList
        ref={flatListRef}
        data={items}
        renderItem={renderListItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        getItemLayout={getItemLayout}
        initialScrollIndex={Math.min(focusedIndex, Math.max(0, items.length - 1))}
        onScrollToIndexFailed={() => {
          flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
        }}
        // Disable native scroll — focus changes are driven by swipe gestures
        // at the list level, not by FlatList's scroll responder.
        scrollEnabled={false}
      />
    </GestureArea>
  );
}

const styles = StyleSheet.create({
  listGestureWrapper: {
    flex: 1,
  },
  list: {
    paddingVertical: LAYOUT.screenPadding,
    gap: LAYOUT.itemGap,
  },
  itemContainer: {
    borderRadius: 12,
    justifyContent: 'center',
    paddingHorizontal: LAYOUT.screenPadding,
    marginHorizontal: LAYOUT.screenPadding,
  },
});
