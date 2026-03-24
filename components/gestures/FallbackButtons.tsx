import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { usePreferencesStore } from '../../stores/preferences';
import type { GestureAction, SwipeDirection } from '../../types';

interface FallbackButtonsProps {
  onAction: (action: GestureAction) => void;
  directions?: SwipeDirection[];
}

export function FallbackButtons({ onAction, directions = ['up', 'down', 'left', 'right'] }: FallbackButtonsProps) {
  const show = usePreferencesStore((s) => s.showFallbackButtons);
  if (!show) return null;

  const labels: Record<SwipeDirection, string> = {
    up: '^', down: 'v', left: '<', right: '>',
  };

  return (
    <View style={styles.container}>
      {directions.map((dir) => (
        <Pressable
          key={dir}
          style={styles.button}
          onPress={() => onAction({ type: 'swipe', direction: dir })}
          accessibilityLabel={`Swipe ${dir}`}
        >
          <Text style={styles.label}>{labels[dir]}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', justifyContent: 'center', gap: 8, padding: 4 },
  button: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.1)', justifyContent: 'center', alignItems: 'center',
  },
  label: { fontSize: 16, color: '#6B6B6B' },
});
