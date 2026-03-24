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
  collapsed?: boolean;
  onExpand?: () => void;
  initialIntent?: string;
}

export function IntentSection({ onNavigateHome, timeOfDay, collapsed, onExpand, initialIntent }: IntentSectionProps) {
  const [intentIndex, setIntentIndex] = useState(() => {
    if (initialIntent) {
      const idx = INTENTS.findIndex((i) => i.text === initialIntent);
      return idx >= 0 ? idx : DEFAULT_INTENT_BY_TIME[timeOfDay] ?? 0;
    }
    return DEFAULT_INTENT_BY_TIME[timeOfDay] ?? 0;
  });

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
    // In collapsed mode, only tap and swipe-up expand the section
    if (collapsed) {
      if (action.type === 'tap' || (action.type === 'swipe' && action.direction === 'up')) {
        onExpand?.();
      }
      return;
    }

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

  // Collapsed: render a compact bar showing the current intent
  if (collapsed) {
    return (
      <GestureArea onAction={handleAction} style={styles.collapsedContainer}>
        <Text style={styles.collapsedLabel}>Intent: </Text>
        <Text style={styles.collapsedText}>{currentIntent.text}</Text>
      </GestureArea>
    );
  }

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
  collapsedContainer: {
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: LAYOUT.screenPadding,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(224, 123, 46, 0.1)',
    borderRadius: 8,
    marginHorizontal: LAYOUT.screenPadding,
  },
  collapsedLabel: {
    fontSize: 14,
    color: '#6B6B6B',
  },
  collapsedText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#E07B2E',
  },
});
