import React, { useCallback, useEffect } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { wrapIndex } from '../../utils/wrapIndex';

// Center-focused, wrapping carousel for input modalities. Focused item is a
// large circle (~100px); the two side items on each side render smaller
// (~52px). Tap the focused item to activate. Tap a side item to pull focus
// AND activate. Horizontal swipe changes focus.
//
// Mic gets special-case styling: when isRecording is true, the focused mic
// shows a red recording dot instead of its glyph (matching the existing mic
// button look). Other inputs don't need extra state.
//
// This component renders the buttons; the parent owns the active input state
// (showHandwriting, showKeyboard, isListening, etc) and the onActivate
// callbacks fire the existing handlers.

export interface CarouselItem {
  id: string;                                       // 'mic' | 'pen' | 'abc' | 'cam' | future ids
  icon: React.ComponentProps<typeof Ionicons>['name']; // Ionicons glyph name
  label: string;                                    // accessibility label (no visible text — icons are self-descriptive)
}

interface InputCarouselProps {
  items: CarouselItem[];
  focusedIndex: number;
  onFocusChange: (index: number) => void;
  onActivate: (item: CarouselItem) => void;
  isRecording?: boolean;        // mic-specific recording indicator
  // Optional inline element rendered below the carousel (e.g. volume bar
  // during mic recording, or a "processing" indicator).
  belowSlot?: React.ReactNode;
}

const FOCUSED_SIZE = 100;
const SIDE_SIZE = 52;
// Visible side slots per side (focused + 2 left + 2 right = 5 visible).
const VISIBLE_SIDES = 2;
// Horizontal gap between the focused item and its first side neighbor.
// Tuned so neighbors don't overlap the focused circle.
const ITEM_GAP = 18;
// Swipe distance (px) past which we commit a focus change at gesture end.
const SWIPE_COMMIT_PX = 30;

export function InputCarousel({
  items,
  focusedIndex,
  onFocusChange,
  onActivate,
  isRecording = false,
  belowSlot,
}: InputCarouselProps) {
  const count = items.length;
  // dragOffset is the live horizontal offset from the resting position.
  // Positive = dragging right (revealing items to the left).
  const dragOffset = useSharedValue(0);

  // When focusedIndex changes externally (e.g. parent resets it), animate.
  useEffect(() => {
    dragOffset.value = withSpring(0, { damping: 18, stiffness: 180 });
  }, [focusedIndex, dragOffset]);

  // Wrap helper. Always returns a valid index in [0, count). Pure function
  // lives in utils/wrapIndex.ts so it'\''s testable with Jest.
  const wrap = useCallback(
    (i: number) => wrapIndex(i, count),
    [count],
  );

  const commitFocus = useCallback(
    (newIndex: number) => {
      const wrapped = wrap(newIndex);
      onFocusChange(wrapped);
    },
    [onFocusChange, wrap],
  );

  const handleActivate = useCallback(
    (idx: number) => {
      const wrapped = wrap(idx);
      if (wrapped !== focusedIndex) {
        // Tapped a side item — pull focus AND activate. Parent updates state,
        // then the activation handler runs.
        commitFocus(wrapped);
      }
      onActivate(items[wrapped]);
    },
    [commitFocus, focusedIndex, items, onActivate, wrap],
  );

  // Pan: track horizontal drag. On release, if displacement exceeded
  // SWIPE_COMMIT_PX, advance focus by one (left or right). Reset dragOffset
  // to 0 immediately so the slots animate to their new resting positions
  // when focusedIndex updates. Smaller drags spring back without changing
  // focus.
  const panGesture = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .onUpdate((e) => {
      dragOffset.value = e.translationX;
    })
    .onEnd((e) => {
      const dx = e.translationX;
      if (Math.abs(dx) >= SWIPE_COMMIT_PX) {
        // Swiping right reveals the previous item (idx - 1); swiping left
        // reveals the next (idx + 1). Mirrors a physical reel.
        // Reset drag immediately — the new focusedIndex shifts every slot's
        // resting position by one, so without a snap-back to 0 we'd get a
        // visible jump.
        dragOffset.value = 0;
        const next = focusedIndex + (dx < 0 ? 1 : -1);
        runOnJS(commitFocus)(next);
      } else {
        dragOffset.value = withSpring(0, { damping: 18, stiffness: 180 });
      }
    });

  return (
    <View style={styles.container}>
      <GestureDetector gesture={panGesture}>
        <View style={styles.row}>
          {/* Render VISIBLE_SIDES on each side + the focused item. Each
              item's resting position is determined by its offset from
              focusedIndex; we animate the drag offset on top. */}
          {Array.from({ length: VISIBLE_SIDES * 2 + 1 }).map((_, slot) => {
            const offset = slot - VISIBLE_SIDES; // -2, -1, 0, 1, 2
            const idx = wrap(focusedIndex + offset);
            const item = items[idx];
            const isFocused = offset === 0;
            const isMic = item.id === 'mic';
            const showRecordingDot = isFocused && isMic && isRecording;

            return (
              <CarouselSlot
                // Stable per-slot key so the animated style doesn't reset
                // every time focusedIndex changes (which swaps the `item`
                // each slot is showing).
                key={`slot-${offset}`}
                slotOffset={offset}
                dragOffset={dragOffset}
                isFocused={isFocused}
                icon={item.icon}
                showRecordingDot={showRecordingDot}
                onPress={() => handleActivate(idx)}
                accessibilityLabel={item.label}
              />
            );
          })}
        </View>
      </GestureDetector>
      {belowSlot && <View style={styles.belowSlot}>{belowSlot}</View>}
    </View>
  );
}

interface CarouselSlotProps {
  slotOffset: number;                                       // -2, -1, 0, 1, 2
  dragOffset: ReturnType<typeof useSharedValue<number>>;    // live drag from gesture
  isFocused: boolean;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  showRecordingDot: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}

// Each slot computes its resting position from slotOffset, then adds the
// live drag value. Size and opacity also interpolate based on effective
// distance-from-center so dragging produces a continuous focus transition.
function CarouselSlot({
  slotOffset,
  dragOffset,
  isFocused,
  icon,
  showRecordingDot,
  onPress,
  accessibilityLabel,
}: CarouselSlotProps) {
  // Resting horizontal position relative to center. Focused item is at 0.
  // Side items are offset by (FOCUSED_SIZE/2 + ITEM_GAP + SIDE_SIZE/2) for
  // the first neighbor, then another (SIDE_SIZE + ITEM_GAP) for each step.
  const firstSideOffset = FOCUSED_SIZE / 2 + ITEM_GAP + SIDE_SIZE / 2;
  const subsequentSideStep = SIDE_SIZE + ITEM_GAP;
  const restingX =
    slotOffset === 0
      ? 0
      : Math.sign(slotOffset) * (firstSideOffset + (Math.abs(slotOffset) - 1) * subsequentSideStep);

  const animatedStyle = useAnimatedStyle(() => {
    // Effective offset including live drag (drag right = positive translation,
    // which pulls items rightward, revealing the left neighbor).
    const x = restingX + dragOffset.value;

    // Interpolate size/opacity based on absolute distance from center.
    // 0..firstSideOffset = focused-zone (full size). Beyond = side size.
    // Smooth transition by mapping abs(x) to a scale factor.
    const absX = Math.abs(x);
    // Scale: 1.0 at center, ~0.52 at firstSideOffset, decreasing further out.
    const scale = interpolate(
      absX,
      [0, firstSideOffset, firstSideOffset + subsequentSideStep],
      [1, SIDE_SIZE / FOCUSED_SIZE, SIDE_SIZE / FOCUSED_SIZE * 0.85],
      Extrapolation.CLAMP,
    );
    const opacity = interpolate(
      absX,
      [0, firstSideOffset, firstSideOffset + subsequentSideStep * 1.5],
      [1, 0.85, 0.3],
      Extrapolation.CLAMP,
    );

    return {
      transform: [{ translateX: x }, { scale }],
      opacity,
    };
  });

  return (
    <Animated.View style={[styles.slot, animatedStyle]} pointerEvents="box-none">
      <Pressable
        onPress={onPress}
        hitSlop={8}
        accessibilityLabel={accessibilityLabel}
        style={[
          styles.button,
          isFocused ? styles.buttonFocused : styles.buttonSide,
        ]}
      >
        {showRecordingDot ? (
          <View style={styles.recordingDot} />
        ) : (
          <Ionicons
            name={icon}
            size={isFocused ? 44 : 24}
            color={isFocused ? '#E07B2E' : '#6B6B6B'}
          />
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  row: {
    // The focused item lives at the visual center of this row; side slots
    // are absolutely positioned by their translateX. We use a fixed-height
    // wrapper so layout doesn't shift as slots scale.
    height: FOCUSED_SIZE + 16,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  slot: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  buttonFocused: {
    width: FOCUSED_SIZE,
    height: FOCUSED_SIZE,
    borderRadius: FOCUSED_SIZE / 2,
    borderWidth: 3,
    borderColor: '#E07B2E',
  },
  buttonSide: {
    width: SIDE_SIZE,
    height: SIDE_SIZE,
    borderRadius: SIDE_SIZE / 2,
    borderWidth: 2,
    borderColor: '#D0D0D0',
  },
  recordingDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#E74C3C',
  },
  belowSlot: {
    marginTop: 8,
    alignItems: 'center',
  },
});
