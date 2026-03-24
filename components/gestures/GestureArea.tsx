import React from 'react';
import { View, type ViewStyle } from 'react-native';
import { useGesture } from './useGesture';
import type { GestureAction, GestureConfig } from '../../types';

interface GestureAreaProps {
  onAction: (action: GestureAction) => void;
  config?: Partial<GestureConfig>;
  style?: ViewStyle;
  children: React.ReactNode;
}

/**
 * Wrapper component that applies gesture recognition to a View.
 * All touch events within this area are classified into semantic actions
 * (swipe, tap, double-tap, long-press) and forwarded to onAction.
 */
export function GestureArea({ onAction, config, style, children }: GestureAreaProps) {
  const { panHandlers } = useGesture({ onAction, config });

  return (
    <View {...panHandlers} style={style}>
      {children}
    </View>
  );
}
