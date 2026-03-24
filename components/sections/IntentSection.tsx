import React, { useState, useCallback } from 'react';
import { Text, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { GestureArea } from '../gestures/GestureArea';
import { useCompositionStore } from '../../stores/composition';
import { useFocusStore } from '../../stores/focus';
import { INTENTS, DEFAULT_INTENT_BY_TIME } from '../../constants/intents';
import { LAYOUT, TYPOGRAPHY, TIMING } from '../../constants/config';
import type { GestureAction, TimeOfDay } from '../../types';

interface IntentSectionProps {
  onNavigateHome: () => void;
  timeOfDay: TimeOfDay;
}

export function IntentSection({ onNavigateHome, timeOfDay }: IntentSectionProps) {
  const [intentIndex, setIntentIndex] = useState(
    () => DEFAULT_INTENT_BY_TIME[timeOfDay] ?? 0,
  );

  const setIntent = useCompositionStore((s) => s.setIntent);
  const incrementCycleCount = useCompositionStore((s) => s.incrementIntentCycleCount);
  const setSection = useFocusStore((s) => s.setSection);

  const currentIntent = INTENTS[intentIndex];

  const cycleIntent = useCallback((direction: 'left' | 'right') => {
    setIntentIndex((prev) => {
      const next = direction === 'right'
        ? (prev + 1) % INTENTS.length
        : (prev - 1 + INTENTS.length) % INTENTS.length;
      return next;
    });
    incrementCycleCount();
  }, [incrementCycleCount]);

  const confirmIntent = useCallback(() => {
    setIntent(currentIntent.text);
    setSection('compose', 0);
  }, [currentIntent.text, setIntent, setSection]);

  const handleAction = (action: GestureAction) => {
    switch (action.type) {
      case 'swipe':
        switch (action.direction) {
          case 'left': cycleIntent('left'); break;
          case 'right': cycleIntent('right'); break;
          case 'up': onNavigateHome(); break;
          case 'down':
            setIntent(currentIntent.text);
            setSection('compose', 0);
            break;
        }
        break;
      case 'double-tap':
        confirmIntent();
        break;
      case 'tap':
        // Add modifier to intent (future enhancement)
        break;
      case 'long-press':
        // Context menu (Task 15)
        break;
    }
  };

  return (
    <GestureArea onAction={handleAction} style={styles.container}>
      <Text style={styles.label}>
        I{intentIndex + 1}: {' '}
      </Text>
      <Text style={styles.intentText}>{currentIntent.text}</Text>
    </GestureArea>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: LAYOUT.headerHeight,
    justifyContent: 'center',
    paddingHorizontal: LAYOUT.screenPadding,
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    fontSize: TYPOGRAPHY.itemLabel.size,
    color: '#6B6B6B',
  },
  intentText: {
    fontSize: TYPOGRAPHY.header.size,
    fontWeight: TYPOGRAPHY.header.weight,
    color: '#1A1A1A',
  },
});
