import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SectionLayout } from '../../components/sections/SectionLayout';
import { CategoryHeader } from '../../components/sections/CategoryHeader';
import { GestureArea } from '../../components/gestures/GestureArea';
import { FocusIndicator } from '../../components/shared/FocusIndicator';
import { useFocusStore } from '../../stores/focus';
import { useCompositionStore } from '../../stores/composition';
import { supabase } from '../../services/supabase';
import type { GestureAction, SavedPhrase } from '../../types';
import { LAYOUT, TYPOGRAPHY } from '../../constants/config';

const CATEGORIES = ['Introductions', 'Daily', 'Social', 'Medical', 'Custom'];

/**
 * Parse saved phrase text for variable format.
 * Convention: "Label = Value" → { label: "Label", value: "Value", isVariable: true }
 * Otherwise: { label: null, value: text, isVariable: false }
 */
function parsePhrase(text: string): { label: string | null; value: string; isVariable: boolean } {
  const eqIdx = text.indexOf(' = ');
  if (eqIdx > 0) {
    return { label: text.slice(0, eqIdx), value: text.slice(eqIdx + 3), isVariable: true };
  }
  return { label: null, value: text, isVariable: false };
}

export default function SavedScreen() {
  const router = useRouter();
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [phrases, setPhrases] = useState<SavedPhrase[]>([]);
  const composeIndex = useFocusStore((s) => s.composeIndex);
  const section = useFocusStore((s) => s.section);
  const moveDown = useFocusStore((s) => s.moveDown);
  const moveUp = useFocusStore((s) => s.moveUp);
  const setSection = useFocusStore((s) => s.setSection);
  const focusReset = useFocusStore((s) => s.reset);

  // Reset focus and clear any stale composition state (intent from prior session)
  useEffect(() => {
    useCompositionStore.getState().reset();
    focusReset();
  }, []);

  useEffect(() => {
    async function fetchPhrases() {
      const { data } = await supabase
        .from('saved_phrases')
        .select('*')
        .ilike('category', category)
        .order('sort_order');
      if (data) {
        setPhrases(data);
        useFocusStore.getState().setComposeListSize(data.length);
      }
    }
    fetchPhrases();
  }, [category]);

  const handleItemAction = (action: GestureAction, phrase: SavedPhrase, index: number) => {
    if (section !== 'compose') return;
    switch (action.type) {
      case 'swipe':
        switch (action.direction) {
          case 'down': moveDown(); break;
          case 'up': moveUp(); break;
          default: break;
        }
        break;
      case 'double-tap': {
        const parsed = parsePhrase(phrase.text);
        // For variables (e.g., "DOB = 12/29/1981"), add only the value
        const textToAdd = parsed.value;
        // Preload as a slot and navigate to compose so user can continue with predictions
        const store = useCompositionStore.getState();
        store.preloadSavedPhrase(textToAdd);
        router.push({ pathname: '/(app)/compose', params: { type: 'saved', value: textToAdd } } as never);
        break;
      }
    }
  };

  const renderItem = ({ item, index }: { item: SavedPhrase; index: number }) => {
    const parsed = parsePhrase(item.text);
    return (
      <GestureArea
        onAction={(action) => handleItemAction(action, item, index)}
        style={{ marginBottom: LAYOUT.itemGap }}
      >
        <FocusIndicator
          isFocused={section === 'compose' && composeIndex === index}
          isTopPrediction={index === 0}
          style={styles.item}
        >
          {parsed.isVariable ? (
            <View>
              <Text style={styles.itemLabel}>{parsed.label}</Text>
              <Text style={styles.itemText} numberOfLines={2}>{parsed.value}</Text>
            </View>
          ) : (
            <Text style={styles.itemText} numberOfLines={3}>{item.text}</Text>
          )}
        </FocusIndicator>
      </GestureArea>
    );
  };

  return (
    <SectionLayout
      headerContent={
        <CategoryHeader
          categories={CATEGORIES}
          onCategoryChange={setCategory}
          onNavigateHome={() => router.back()}
          onFocusDown={() => setSection('compose', 0)}
        />
      }
      itemsContent={
        <FlatList
          data={phrases}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
        />
      }
      onPhraseSave={() => {}}
      onPhraseNavigateUp={() => setSection('compose')}
    />
  );
}

const styles = StyleSheet.create({
  item: {
    minHeight: LAYOUT.listItemHeight,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    justifyContent: 'center',
    paddingHorizontal: LAYOUT.screenPadding,
    paddingVertical: 12,
  },
  itemLabel: {
    fontSize: TYPOGRAPHY.itemLabel.size,
    color: '#6B6B6B',
    marginBottom: 2,
  },
  itemText: {
    fontSize: TYPOGRAPHY.listItem.size,
    fontWeight: TYPOGRAPHY.listItem.weight,
    color: '#1A1A1A',
  },
});
