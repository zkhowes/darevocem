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
import type { GestureAction, CommonItem } from '../../types';
import { LAYOUT, TYPOGRAPHY } from '../../constants/config';

const CATEGORIES = ['Dates', 'Names', 'Medications', 'Places'];

export default function CommonScreen() {
  const router = useRouter();
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [items, setItems] = useState<CommonItem[]>([]);
  const addSlot = useCompositionStore((s) => s.addSlot);
  const composeIndex = useFocusStore((s) => s.composeIndex);
  const section = useFocusStore((s) => s.section);
  const moveDown = useFocusStore((s) => s.moveDown);
  const moveUp = useFocusStore((s) => s.moveUp);
  const setSection = useFocusStore((s) => s.setSection);
  const focusReset = useFocusStore((s) => s.reset);

  // Reset focus to the header section when the screen mounts
  useEffect(() => { focusReset(); }, []);

  useEffect(() => {
    async function fetchItems() {
      const { data } = await supabase
        .from('common_items')
        .select('*')
        .ilike('category', category)
        .order('sort_order');
      if (data) {
        // Resolve dynamic items: [Today] becomes the actual current date
        const resolved = data.map((item: CommonItem) => {
          if (item.is_dynamic && item.label === '[Today]') {
            return { ...item, value: new Date().toLocaleDateString() };
          }
          return item;
        });
        setItems(resolved);
        useFocusStore.getState().setComposeListSize(resolved.length);
      }
    }
    fetchItems();
  }, [category]);

  const handleItemAction = (action: GestureAction, item: CommonItem, index: number) => {
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
        // Double-tap adds the item's display value to the composed phrase
        addSlot(item.value);
        break;
    }
  };

  const renderItem = ({ item, index }: { item: CommonItem; index: number }) => (
    <GestureArea
      onAction={(action) => handleItemAction(action, item, index)}
      style={{ marginBottom: LAYOUT.itemGap }}
    >
      <FocusIndicator
        isFocused={section === 'compose' && composeIndex === index}
        isTopPrediction={index === 0}
        style={styles.item}
      >
        <Text style={styles.itemLabel}>{item.label}</Text>
        <Text style={styles.itemValue}>{item.value}</Text>
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
          data={items}
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
  },
  itemLabel: { fontSize: TYPOGRAPHY.itemLabel.size, color: '#6B6B6B' },
  itemValue: {
    fontSize: TYPOGRAPHY.listItem.size,
    fontWeight: TYPOGRAPHY.listItem.weight,
    color: '#1A1A1A',
  },
});
