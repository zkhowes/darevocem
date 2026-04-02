import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { SectionLayout } from '../../components/sections/SectionLayout';
import { CategoryHeader } from '../../components/sections/CategoryHeader';
import { GestureArea } from '../../components/gestures/GestureArea';
import { FocusIndicator } from '../../components/shared/FocusIndicator';
import { useFocusStore } from '../../stores/focus';
import { useCompositionStore } from '../../stores/composition';
import { usePreferencesStore } from '../../stores/preferences';
import { speakPreview, cancelPreview } from '../../services/auditoryPreview';
import { supabase } from '../../services/supabase';
import { formatTodaySpoken } from '../../utils/profileSeeding';
import type { GestureAction, SavedPhrase } from '../../types';
import { LAYOUT, TYPOGRAPHY } from '../../constants/config';

// Personal is the only seeded category for now
const CATEGORIES = ['Personal'];

/**
 * Resolve dynamic values in saved phrases.
 * "Today" label always shows today's actual date as the value.
 */
function resolveDynamicPhrase(phrase: SavedPhrase): SavedPhrase {
  if (phrase.label === 'Today') {
    const today = formatTodaySpoken();
    return { ...phrase, text: today, value: today };
  }
  return phrase;
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
        // Resolve dynamic values (e.g. Today's date)
        const resolved = data.map(resolveDynamicPhrase);
        setPhrases(resolved);
        useFocusStore.getState().setComposeListSize(resolved.length);
      }
    }
    fetchPhrases();
  }, [category]);

  const auditoryPreview = usePreferencesStore((s) => s.auditoryPreview);

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
      case 'tap': {
        // Focus this item and speak the label (for variables) or text preview
        useFocusStore.getState().setComposeIndex(index);
        if (auditoryPreview) {
          // For variables, speak just the label ("Name", "Phone")
          // Backward compat: old data may have "Label = Value" in text
          let previewLabel = phrase.label;
          if (!previewLabel && phrase.text.includes(' = ')) {
            previewLabel = phrase.text.slice(0, phrase.text.indexOf(' = '));
          }
          const previewText = previewLabel ?? phrase.text.split(' ').slice(0, 4).join(' ');
          speakPreview(previewText);
        }
        break;
      }
      case 'double-tap': {
        cancelPreview();
        // For variable phrases (label + value), insert only the value.
        // For regular phrases, insert the full text.
        const textToAdd = phrase.value ?? phrase.text;
        const store = useCompositionStore.getState();
        store.preloadSavedPhrase(textToAdd);
        router.push({ pathname: '/(app)/compose', params: { type: 'saved', value: textToAdd } } as never);
        break;
      }
    }
  };

  const renderItem = ({ item, index }: { item: SavedPhrase; index: number }) => {
    // Parse label/value — use columns if available, fall back to old "=" format
    let label = item.label ?? null;
    let value = item.value ?? null;
    if (!label && item.text.includes(' = ')) {
      const eqIdx = item.text.indexOf(' = ');
      label = item.text.slice(0, eqIdx);
      value = item.text.slice(eqIdx + 3);
    }
    const isVariable = !!label;
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
          {isVariable ? (
            <View>
              <Text style={styles.itemLabel}>{label}</Text>
              <Text style={styles.itemText} numberOfLines={2}>{value}</Text>
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
        <View style={styles.headerRow}>
          <CategoryHeader
            categories={CATEGORIES}
            onCategoryChange={setCategory}
            onNavigateHome={() => router.back()}
            onFocusDown={() => setSection('compose', 0)}
          />
          <Pressable style={styles.closeButton} onPress={() => router.back()}>
            <Text style={styles.closeText}>X</Text>
          </Pressable>
        </View>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: LAYOUT.screenPadding,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E5E5E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
  },
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
