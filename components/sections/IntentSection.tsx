import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, Modal, Pressable, StyleSheet } from 'react-native';
import { GestureArea } from '../gestures/GestureArea';
import { useCompositionStore } from '../../stores/composition';
import { useFocusStore } from '../../stores/focus';
import { usePreferencesStore } from '../../stores/preferences';
import { getAlternativeIntent } from '../../services/predictions';
import { speakPreview } from '../../services/auditoryPreview';
import { logPredictionDebug } from '../shared/PredictionDebug';
import { INTENTS, DEFAULT_INTENT_BY_TIME } from '../../constants/intents';
import { getIntentColor } from '../../constants/fitzgerald';
import { LAYOUT, TYPOGRAPHY } from '../../constants/config';
import type { GestureAction, TimeOfDay } from '../../types';

declare const __DEV__: boolean;

interface IntentSectionProps {
  onNavigateHome: () => void;
  timeOfDay: TimeOfDay;
  initialIntent?: string;
  onContextAction?: (action: 'record' | 'type' | 'camera') => void;
  onIntentChanged?: () => void;
}

export function IntentSection({
  onNavigateHome,
  timeOfDay,
  initialIntent,
  onContextAction,
  onIntentChanged,
}: IntentSectionProps) {
  // Subscribe to the composition store's intent for reactive updates
  const storeIntent = useCompositionStore((s) => s.intent);
  const slots = useCompositionStore((s) => s.slots);

  // Intent is editable when no words have been added to the phrase.
  // Once a slot is added, intent locks to prevent breaking the sentence.
  const isEditable = slots.length === 0;

  // Use store intent if available, otherwise fall back to initial prop
  const activeIntent = storeIntent ?? initialIntent ?? null;

  // Track whether intent is a curated one (cycleable) or custom text
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

  // History of intent indices shown (for swipe-right back-tracking)
  const [intentHistory, setIntentHistory] = useState<number[]>([]);
  // All intents visited during this session (for diverge when history exhausted)
  const [visitedIntents, setVisitedIntents] = useState<Set<number>>(() => new Set());

  // Context menu state (double-tap)
  const [contextMenuVisible, setContextMenuVisible] = useState(false);

  const displayDensity = usePreferencesStore((s) => s.displayDensity);
  const setIntent = useCompositionStore((s) => s.setIntent);
  const incrementCycleCount = useCompositionStore((s) => s.incrementIntentCycleCount);
  const setSection = useFocusStore((s) => s.setSection);

  // Simplified mode: only cycle through first 4 intents (most essential)
  const maxIntents = displayDensity === 'simplified' ? 4 : INTENTS.length;
  const currentIntent = INTENTS[intentIndex];

  // Navigate to a new intent index, pushing current to history
  const navigateToIntent = useCallback((newIndex: number) => {
    setIntentHistory((prev) => [...prev, intentIndex]);
    setVisitedIntents((prev) => new Set(prev).add(newIndex));
    setIntentIndex(newIndex);
    setIntent(INTENTS[newIndex].text);
    incrementCycleCount();
    // Auditory preview: speak the new intent so the user knows which one they're on
    if (auditoryPreview) {
      speakPreview(INTENTS[newIndex].text);
    }
  }, [intentIndex, setIntent, incrementCycleCount, auditoryPreview]);

  // Swipe left: find a new intent following a path (prediction-based or curated)
  const handleSwipeLeft = useCallback(async () => {
    if (!isEditable) return;

    // Try AI prediction for a semantically related alternative
    const triedTexts = Array.from(visitedIntents).map((i) => INTENTS[i]?.text).filter(Boolean);
    triedTexts.push(currentIntent.text);
    const startMs = Date.now();
    const alternative = await getAlternativeIntent(currentIntent.text, triedTexts);

    if (__DEV__) {
      logPredictionDebug({
        timestamp: Date.now(),
        action: 'INTENT CYCLE (swipe-left)',
        fullPhrase: currentIntent.text,
        triedItems: triedTexts,
        predictions: alternative ? [alternative] : [],
        latencyMs: Date.now() - startMs,
        source: alternative ? 'claude' : 'fallback',
      });
    }

    if (alternative) {
      // Check if the alternative matches a curated intent
      const matchIdx = INTENTS.findIndex((i) => i.text.toLowerCase() === alternative.toLowerCase());
      if (matchIdx >= 0) {
        navigateToIntent(matchIdx);
      } else {
        // Custom intent from AI — push history and set directly
        setIntentHistory((prev) => [...prev, intentIndex]);
        setIntent(alternative);
        incrementCycleCount();
        if (auditoryPreview) {
          speakPreview(alternative);
        }
      }
      return;
    }

    // Fallback: advance to next curated intent in the list
    const nextIndex = (intentIndex + 1) % maxIntents;
    navigateToIntent(nextIndex);
  }, [isEditable, intentIndex, currentIntent.text, visitedIntents, navigateToIntent, setIntent, incrementCycleCount, maxIntents, auditoryPreview]);

  // Swipe right: go back through previously shown intents.
  // When history is empty, diverge to a different path.
  const handleSwipeRight = useCallback(() => {
    if (!isEditable) return;

    if (intentHistory.length > 0) {
      // Pop the last intent from history
      const prevIndex = intentHistory[intentHistory.length - 1];
      setIntentHistory((prev) => prev.slice(0, -1));
      setIntentIndex(prevIndex);
      setIntent(INTENTS[prevIndex].text);
      incrementCycleCount();
      if (auditoryPreview) {
        speakPreview(INTENTS[prevIndex].text);
      }
    } else {
      // History empty — find an unvisited intent for a different path
      let divergeIndex = -1;
      for (let i = 1; i < maxIntents; i++) {
        const candidate = (intentIndex - i + maxIntents) % maxIntents;
        if (!visitedIntents.has(candidate)) {
          divergeIndex = candidate;
          break;
        }
      }
      // If all visited, just go backwards in the list
      if (divergeIndex < 0) {
        divergeIndex = (intentIndex - 1 + maxIntents) % maxIntents;
      }
      setVisitedIntents((prev) => new Set(prev).add(divergeIndex));
      setIntentIndex(divergeIndex);
      setIntent(INTENTS[divergeIndex].text);
      incrementCycleCount();
      if (auditoryPreview) {
        speakPreview(INTENTS[divergeIndex].text);
      }
    }
  }, [isEditable, intentHistory, intentIndex, visitedIntents, setIntent, incrementCycleCount, auditoryPreview, maxIntents]);

  const handleAction = (action: GestureAction) => {
    switch (action.type) {
      case 'swipe':
        switch (action.direction) {
          case 'left':
            if (isEditable) {
              handleSwipeLeft();
            }
            break;
          case 'right':
            if (isEditable) {
              handleSwipeRight();
            }
            break;
          case 'down': onNavigateHome(); break;
          case 'up':
            // Swipe up = finger bottom->top = focus moves down to compose
            if (isEditable) {
              setIntent(currentIntent.text);
            }
            setSection('compose', 0);
            break;
        }
        break;
      case 'tap':
        // Single tap (editable only): add modifier to intent ("I need" -> "I need a")
        if (!isEditable) break;
        {
          const store = useCompositionStore.getState();
          const intentModifiers = ['to', 'a', 'some', 'my', 'the'];
          if (store.modifierState?.targetItem === currentIntent.text) {
            store.cycleModifier();
          } else {
            store.setModifiers(currentIntent.text, intentModifiers);
          }
          // Update the intent in the store with the modifier (or clear if cycled through all)
          const modText = useCompositionStore.getState().getModifierDisplayText();
          if (modText) {
            setIntent(modText);
          } else {
            // Modifier was cleared (cycled through all) — restore base intent
            setIntent(currentIntent.text);
          }
          // Predictions are stale after intent change — parent must re-fetch
          onIntentChanged?.();
        }
        break;
      case 'double-tap':
        // Double tap (editable only): show context menu with record, type, camera
        if (isEditable) {
          setContextMenuVisible(true);
        } else {
          // When locked, double-tap confirms and moves to compose
          setSection('compose', 0);
        }
        break;
      case 'long-press':
        // Long-press opens context menu (same as double-tap) when editable
        if (isEditable) {
          setContextMenuVisible(true);
        }
        break;
    }
  };

  const handleContextAction = useCallback((action: 'record' | 'type' | 'camera') => {
    setContextMenuVisible(false);
    onContextAction?.(action);
  }, [onContextAction]);

  const auditoryPreview = usePreferencesStore((s) => s.auditoryPreview);

  // Display text: custom intent from keyboard/common, or curated intent from cycling
  const displayText = customIntentText ?? currentIntent.text;

  // Fitzgerald Key: tint the intent header border with the category color
  const intentColor = useMemo(() => getIntentColor(displayText), [displayText]);

  return (
    <>
      <GestureArea
        onAction={handleAction}
        style={StyleSheet.flatten([
          styles.container,
          isEditable
            ? { borderBottomColor: intentColor }
            : styles.lockedContainer,
        ])}
      >
        <Text style={styles.label}>
          {isEditable
            ? (!customIntentText ? `I${intentIndex + 1}` : 'Intent')
            : 'Intent'}
        </Text>
        <View style={styles.intentRow}>
          <Text style={[
            styles.intentText,
            !isEditable && styles.lockedText,
          ]}>
            {displayText}
          </Text>
          {!isEditable && (
            <Text style={styles.lockIcon}>{'\u{1F512}'}</Text>
          )}
        </View>
      </GestureArea>

      {/* Context menu: record, type, camera (replaces intent) */}
      <Modal
        visible={contextMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setContextMenuVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setContextMenuVisible(false)}
        >
          <View style={styles.contextMenu}>
            <Text style={styles.contextMenuTitle}>Replace intent with...</Text>
            <Pressable
              style={styles.contextMenuItem}
              onPress={() => handleContextAction('record')}
            >
              <Text style={styles.contextMenuIcon}>mic</Text>
              <Text style={styles.contextMenuText}>Record</Text>
            </Pressable>
            <Pressable
              style={styles.contextMenuItem}
              onPress={() => handleContextAction('type')}
            >
              <Text style={styles.contextMenuIcon}>kbd</Text>
              <Text style={styles.contextMenuText}>Type</Text>
            </Pressable>
            <Pressable
              style={styles.contextMenuItem}
              onPress={() => handleContextAction('camera')}
            >
              <Text style={styles.contextMenuIcon}>cam</Text>
              <Text style={styles.contextMenuText}>Camera</Text>
            </Pressable>
            <Pressable
              style={[styles.contextMenuItem, styles.contextMenuCancel]}
              onPress={() => setContextMenuVisible(false)}
            >
              <Text style={styles.contextMenuCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // Mirrors PhraseSection but inverted: colored border on bottom instead of top
  container: {
    minHeight: LAYOUT.headerHeight,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 2,
    justifyContent: 'center',
    paddingHorizontal: LAYOUT.screenPadding,
    paddingVertical: 12,
  },
  lockedContainer: {
    borderBottomColor: '#999',
  },
  label: {
    fontSize: TYPOGRAPHY.itemLabel.size,
    color: '#6B6B6B',
  },
  intentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  intentText: {
    fontSize: TYPOGRAPHY.header.size,
    fontWeight: TYPOGRAPHY.header.weight,
    color: '#1A1A1A',
    flex: 1,
  },
  lockedText: {
    color: '#6B6B6B',
  },
  lockIcon: {
    fontSize: 14,
    marginLeft: 8,
  },
  // Context menu styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contextMenu: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    width: '80%',
    maxWidth: 320,
  },
  contextMenuTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 16,
    textAlign: 'center',
  },
  contextMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E0',
    gap: 12,
  },
  contextMenuIcon: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E07B2E',
    width: 32,
    textAlign: 'center',
  },
  contextMenuText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#1A1A1A',
  },
  contextMenuCancel: {
    marginTop: 8,
    justifyContent: 'center',
  },
  contextMenuCancelText: {
    fontSize: 16,
    color: '#6B6B6B',
    textAlign: 'center',
  },
});
