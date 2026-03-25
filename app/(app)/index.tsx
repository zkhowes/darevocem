import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WheelPicker } from '../../components/shared/WheelPicker';
import { StarterCard } from '../../components/home/StarterCard';
import { ErrorBoundary } from '../../components/shared/ErrorBoundary';
import { useCompositionStore } from '../../stores/composition';
import { getTimeOfDay } from '../../services/context';
import { getPredictions, getModifiers } from '../../services/predictions';
import { INTENTS, DEFAULT_INTENT_BY_TIME } from '../../constants/intents';
import { FALLBACK_MODIFIERS } from '../../constants/fallbacks';
import { LAYOUT } from '../../constants/config';
import { supabase } from '../../services/supabase';
import { generateId } from '../../types';
import type { GestureAction, WheelPickerItem, CommonItem, SavedPhrase } from '../../types';

export default function HomeScreen() {
  const router = useRouter();
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [commonItems, setCommonItems] = useState<CommonItem[]>([]);
  const [savedPhrases, setSavedPhrases] = useState<SavedPhrase[]>([]);
  const modifierState = useCompositionStore((s) => s.modifierState);

  // Fetch common items and saved phrases on mount
  useEffect(() => {
    async function loadData() {
      const [commonResult, savedResult] = await Promise.all([
        supabase.from('common_items').select('*').order('sort_order'),
        supabase.from('saved_phrases').select('*').order('sort_order'),
      ]);
      if (commonResult.data) setCommonItems(commonResult.data);
      if (savedResult.data) setSavedPhrases(savedResult.data);
    }
    loadData();
  }, []);

  // Build unified card list: predicted intents + common items + saved phrases
  const starterCards: WheelPickerItem[] = useMemo(() => {
    const timeOfDay = getTimeOfDay();
    const defaultIdx = DEFAULT_INTENT_BY_TIME[timeOfDay] ?? 0;

    // Predicted intents — reordered so time-relevant is first
    const intentCards: WheelPickerItem[] = INTENTS.map((intent, i) => ({
      id: `intent-${i}`,
      text: intent.text,
      itemType: 'prediction' as const,
      color: '#E07B2E',
      metadata: { addsToPhrase: intent.addsToPhrase, originalIndex: i },
    }));
    // Move the default intent to the front
    if (defaultIdx > 0 && defaultIdx < intentCards.length) {
      const [defaultCard] = intentCards.splice(defaultIdx, 1);
      intentCards.unshift(defaultCard);
    }

    // Common items — resolve dynamic values
    const commonCards: WheelPickerItem[] = commonItems.map((item) => {
      const resolvedValue = item.is_dynamic && item.value === '[Today]'
        ? new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
        : item.value;
      return {
        id: `common-${item.id}`,
        text: item.label || resolvedValue,
        itemType: 'common' as const,
        color: '#2B7A78',
        metadata: { value: resolvedValue, label: item.label, category: item.category },
      };
    });

    // Saved phrases
    const savedCards: WheelPickerItem[] = savedPhrases.map((phrase) => ({
      id: `saved-${phrase.id}`,
      text: phrase.text,
      itemType: 'saved' as const,
      color: '#7B68AE',
      metadata: { category: phrase.category },
    }));

    // Limit to 3 per type to keep home screen clean
    return [
      ...intentCards.slice(0, 3),
      ...commonCards.slice(0, 3),
      ...savedCards.slice(0, 3),
    ];
  }, [commonItems, savedPhrases]);

  const handleGesture = useCallback(
    async (gesture: GestureAction, item: WheelPickerItem, index: number) => {
      if (gesture.type === 'double-tap') {
        const store = useCompositionStore.getState();

        if (item.itemType === 'prediction') {
          const intentText = item.text;
          store.preload(intentText, []);
          store.setLoading(true);

          getPredictions(intentText, [], 'object', getTimeOfDay(), [], [])
            .then((predictions) => {
              useCompositionStore.getState().setPredictions(predictions);
            })
            .finally(() => {
              useCompositionStore.getState().setLoading(false);
            });

          router.push({ pathname: '/(app)/compose', params: { type: 'prediction', value: intentText } } as never);
        } else if (item.itemType === 'common') {
          const value = (item.metadata?.value as string) ?? item.text;
          store.preloadCommonItem(value);

          getPredictions('', [value], 'object', getTimeOfDay(), [], [])
            .then((predictions) => {
              useCompositionStore.getState().setPredictions(predictions);
            })
            .finally(() => {
              useCompositionStore.getState().setLoading(false);
            });

          router.push({ pathname: '/(app)/compose', params: { type: 'common', value } } as never);
        } else if (item.itemType === 'saved') {
          store.preloadSavedPhrase(item.text);
          router.push({ pathname: '/(app)/compose', params: { type: 'saved', value: item.text } } as never);
        }
      } else if (gesture.type === 'tap') {
        const store = useCompositionStore.getState();
        if (store.modifierState && store.modifierState.targetItem === item.text) {
          store.cycleModifier();
        } else {
          try {
            const modifiers = await getModifiers('', [], item.text);
            store.setModifiers(item.text, modifiers.length > 0 ? modifiers : FALLBACK_MODIFIERS);
          } catch {
            store.setModifiers(item.text, FALLBACK_MODIFIERS);
          }
        }
      }
      // Left/right swipe: no-op on home screen
    },
    [router],
  );

  const renderItem = useCallback(
    (item: WheelPickerItem, isFocused: boolean) => {
      const modText = isFocused && modifierState?.targetItem === item.text
        ? useCompositionStore.getState().getModifierDisplayText()
        : null;
      return <StarterCard item={item} isFocused={isFocused} modifierText={modText} />;
    },
    [modifierState],
  );

  return (
    <ErrorBoundary>
      <SafeAreaView style={styles.container}>
        <Text style={styles.title}>DARE VOCEM</Text>
        {/* Record card — coming in Phase 2 (voice input) */}
        <View style={styles.recordCard}>
          <Text style={styles.recordIcon}>🎙</Text>
          <Text style={styles.recordText}>Record</Text>
          <Text style={styles.recordSoon}>Coming soon</Text>
        </View>
        <WheelPicker
          items={starterCards}
          focusedIndex={focusedIndex}
          onFocusChange={setFocusedIndex}
          onGesture={handleGesture}
          renderItem={renderItem}
        />
      </SafeAreaView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F0',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
    letterSpacing: 6,
    textAlign: 'center',
    marginVertical: 24,
  },
  recordCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: LAYOUT.screenPadding,
    marginBottom: 16,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#E07B2E',
    opacity: 0.6,
  },
  recordIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  recordText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1A1A1A',
    flex: 1,
  },
  recordSoon: {
    fontSize: 14,
    color: '#6B6B6B',
    fontStyle: 'italic',
  },
});
