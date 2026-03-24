import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { LAYOUT, TIMING } from '../../constants/config';

interface FocusIndicatorProps {
  isFocused: boolean;
  isTopPrediction?: boolean;
  children: React.ReactNode;
  style?: object;
}

export function FocusIndicator({
  isFocused,
  isTopPrediction = false,
  children,
  style,
}: FocusIndicatorProps) {
  const scale = useSharedValue(1);
  const borderWidth = useSharedValue(0);

  useEffect(() => {
    // Spring to focused state: 102% scale + 4px teal left border, 150ms
    scale.value = withSpring(isFocused ? LAYOUT.focusScale : 1, {
      duration: TIMING.focusAnimationMs,
    });
    borderWidth.value = withSpring(isFocused ? LAYOUT.focusBorderWidth : 0, {
      duration: TIMING.focusAnimationMs,
    });
  }, [isFocused]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    borderLeftWidth: borderWidth.value,
  }));

  return (
    <Animated.View
      style={[
        styles.container,
        isTopPrediction && styles.topPrediction,
        animatedStyle,
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderLeftColor: '#2B7A78',
    borderLeftWidth: 0,
  },
  topPrediction: {
    // Warm amber tint for the highest-ranked prediction
    backgroundColor: 'rgba(224, 123, 46, 0.15)',
  },
});
