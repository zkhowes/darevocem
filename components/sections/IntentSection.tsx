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
  // Subscribe to the composition store's intent for reactive updates (phrase mode changes, etc.)
  const storeIntent = useCompositionStore((s) => s.intent);

  // Use store intent if available, otherwise fall back to initial prop
  const activeIntent = storeIntent ?? initialIntent ?? null;

  // Track whether intent is a curated one (cycleable) or custom text (display-only)
  const isCustomIntent = activeIntent
    ? INTENTS.findIndex((i) => i.text === activeIntent) < 0
    : false;
  const customIntentText = isCustomIntent ? activeIntent : null;

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
          case 'left': cycleIntent('right'); break;
          case 'right': cycleIntent('left'); break;
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
        // Cycle intent modifier ("I need" → "I need to" → "I need a" → "I need some")
        {
          const store = useCompositionStore.getState();
          const intentModifiers = ['to', 'a', 'some', 'my', 'the'];
          if (store.modifierState?.targetItem === currentIntent.text) {
            store.cycleModifier();
          } else {
            store.setModifiers(currentIntent.text, intentModifiers);
          }
          // Update the intent in the store with the modifier
          const modText = useCompositionStore.getState().getModifierDisplayText();
          if (modText) {
            setIntent(modText);
          }
        }
        break;
      case 'long-press':
        // Context menu (Task 15)
        break;
    }
  };

  // Display text: custom intent from keyboard/common, or curated intent from cycling
  const displayText = customIntentText ?? currentIntent.text;

  // Collapsed: render a compact bar showing the current intent
  if (collapsed) {
    return (
      <GestureArea onAction={handleAction} style={styles.collapsedContainer}>
        <Text style={styles.collapsedLabel}>Intent: </Text>
        <Text style={styles.collapsedText}>{displayText}</Text>
      </GestureArea>
    );
  }

  return (
    <GestureArea onAction={handleAction} style={styles.container}>
      {!customIntentText && (
        <Text style={styles.label}>
          I{intentIndex + 1}: {' '}
        </Text>
      )}
      <Text style={styles.intentText}>{displayText}</Text>
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
