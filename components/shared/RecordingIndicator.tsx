import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';

interface RecordingIndicatorProps {
  /** Whether recording is active */
  active: boolean;
  /** Size of the dot in pixels */
  size?: number;
}

/**
 * Pulsing red dot that indicates active recording.
 * Uses react-native-reanimated (already installed) for smooth animation.
 */
export function RecordingIndicator({ active, size = 12 }: RecordingIndicatorProps) {
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);

  useEffect(() => {
    if (active) {
      opacity.value = withRepeat(
        withSequence(
          withTiming(0.3, { duration: 800 }),
          withTiming(1, { duration: 800 }),
        ),
        -1, // infinite
      );
      scale.value = withRepeat(
        withSequence(
          withTiming(1.3, { duration: 800 }),
          withTiming(1, { duration: 800 }),
        ),
        -1,
      );
    } else {
      cancelAnimation(opacity);
      cancelAnimation(scale);
      opacity.value = withTiming(0, { duration: 200 });
      scale.value = 1;
    }
  }, [active, opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  if (!active) return null;

  return (
    <Animated.View
      style={[
        styles.dot,
        { width: size, height: size, borderRadius: size / 2 },
        animatedStyle,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  dot: {
    backgroundColor: '#E74C3C',
  },
});
