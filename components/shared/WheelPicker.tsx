import React, { useCallback, useRef } from 'react';
import { View, StyleSheet, FlatList, type ViewToken } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
  interpolate,
} from 'react-native-reanimated';
import { GestureArea } from '../gestures/GestureArea';
import { LAYOUT, TIMING } from '../../constants/config';
import type { GestureAction, WheelPickerItem } from '../../types';

interface WheelPickerProps {
  items: WheelPickerItem[];
  focusedIndex: number;
  onFocusChange: (index: number) => void;
  onGesture: (gesture: GestureAction, item: WheelPickerItem, index: number) => void;
  renderItem: (item: WheelPickerItem, isFocused: boolean) => React.ReactNode;
}

function WheelPickerItemView({
  item,
  isFocused,
  onGesture,
  renderItem,
}: {
  item: WheelPickerItem;
  isFocused: boolean;
  onGesture: (gesture: GestureAction) => void;
  renderItem: (item: WheelPickerItem, isFocused: boolean) => React.ReactNode;
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

  return (
    <GestureArea onAction={onGesture} style={styles.gestureWrapper}>
      <Animated.View
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
    </GestureArea>
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

  React.useEffect(() => {
    if (flatListRef.current && items.length > 0 && focusedIndex >= 0 && focusedIndex < items.length) {
      flatListRef.current.scrollToIndex({
        index: focusedIndex,
        animated: true,
        viewPosition: 0.5,
      });
    }
  }, [focusedIndex, items.length]);

  const handleGesture = useCallback(
    (gesture: GestureAction, item: WheelPickerItem, index: number) => {
      if (gesture.type === 'swipe') {
        if (gesture.direction === 'down' && index < items.length - 1) {
          onFocusChange(index + 1);
          return;
        }
        if (gesture.direction === 'up' && index > 0) {
          onFocusChange(index - 1);
          return;
        }
      }
      onGesture(gesture, item, index);
    },
    [items.length, onFocusChange, onGesture],
  );

  const renderListItem = useCallback(
    ({ item, index }: { item: WheelPickerItem; index: number }) => (
      <WheelPickerItemView
        item={item}
        isFocused={index === focusedIndex}
        onGesture={(gesture) => handleGesture(gesture, item, index)}
        renderItem={renderItem}
      />
    ),
    [focusedIndex, handleGesture, renderItem],
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
      // Disable native scroll — focus changes are driven by swipe gestures on each item.
      // FlatList's scroll responder otherwise intercepts vertical touches before
      // PanResponder can classify them as swipes.
      scrollEnabled={false}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    paddingVertical: LAYOUT.screenPadding,
    gap: LAYOUT.itemGap,
  },
  gestureWrapper: {
    marginHorizontal: LAYOUT.screenPadding,
  },
  itemContainer: {
    borderRadius: 12,
    justifyContent: 'center',
    paddingHorizontal: LAYOUT.screenPadding,
  },
});
