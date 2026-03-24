import React, { useEffect, useState } from 'react';
import { Text, FlatList, StyleSheet } from 'react-native';
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

export default function SavedScreen() {
  const router = useRouter();
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [phrases, setPhrases] = useState<SavedPhrase[]>([]);
  const addSlot = useCompositionStore((s) => s.addSlot);
  // setIntent only accepts string — we use '' to clear the intent before inserting
  // a full saved phrase, so the phrase bar shows just the phrase text without an intent prefix
  const setIntent = useCompositionStore((s) => s.setIntent);
  const composeIndex = useFocusStore((s) => s.composeIndex);
  const section = useFocusStore((s) => s.section);
  const moveDown = useFocusStore((s) => s.moveDown);
  const moveUp = useFocusStore((s) => s.moveUp);
  const setSection = useFocusStore((s) => s.setSection);
  const focusReset = useFocusStore((s) => s.reset);

  // Reset focus to the header section when the screen mounts
  useEffect(() => { focusReset(); }, []);

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
    // Only handle gestures when the compose section is focused
    if (section !== 'compose') return;
    switch (action.type) {
      case 'swipe':
        switch (action.direction) {
          case 'down': moveDown(); break;
          case 'up': moveUp(); break;
          default: break;
        }
        break;
      case 'double-tap':
        // Saved phrases are full sentences — clear any active intent so the
        // phrase bar shows just the selected phrase without an intent prefix
        setIntent('');
        addSlot(phrase.text);
        break;
    }
  };

  const renderItem = ({ item, index }: { item: SavedPhrase; index: number }) => (
    <GestureArea
      onAction={(action) => handleItemAction(action, item, index)}
      style={{ marginBottom: LAYOUT.itemGap }}
    >
      <FocusIndicator
        isFocused={section === 'compose' && composeIndex === index}
        isTopPrediction={index === 0}
        style={styles.item}
      >
        <Text style={styles.itemText} numberOfLines={3}>{item.text}</Text>
      </FocusIndicator>
    </GestureArea>
  );

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
  itemText: {
    fontSize: TYPOGRAPHY.listItem.size,
    fontWeight: TYPOGRAPHY.listItem.weight,
    color: '#1A1A1A',
  },
});
