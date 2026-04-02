import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { SectionLayout } from '../../components/sections/SectionLayout';
import { GestureArea } from '../../components/gestures/GestureArea';
import { FocusIndicator } from '../../components/shared/FocusIndicator';
import { useFocusStore } from '../../stores/focus';
import { useCompositionStore } from '../../stores/composition';
import { usePreferencesStore } from '../../stores/preferences';
import { speakPreview, cancelPreview } from '../../services/auditoryPreview';
import { getCommonPhrases } from '../../services/predictions';
import { getTimeOfDay } from '../../services/context';
import type { GestureAction, ComposeItem } from '../../types';
import { LAYOUT, TYPOGRAPHY } from '../../constants/config';

const TIME_LABELS = {
  morning: 'Good Morning',
  afternoon: 'Good Afternoon',
  evening: 'Good Evening',
  night: 'Good Night',
} as const;

export default function CommonScreen() {
  const router = useRouter();
  const [phrases, setPhrases] = useState<ComposeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const composeIndex = useFocusStore((s) => s.composeIndex);
  const section = useFocusStore((s) => s.section);
  const moveDown = useFocusStore((s) => s.moveDown);
  const setSection = useFocusStore((s) => s.setSection);
  const focusReset = useFocusStore((s) => s.reset);
  const auditoryPreview = usePreferencesStore((s) => s.auditoryPreview);

  const timeOfDay = getTimeOfDay();

  useEffect(() => {
    useCompositionStore.getState().reset();
    focusReset();

    async function load() {
      setLoading(true);
      try {
        const items = await getCommonPhrases(timeOfDay);
        setPhrases(items);
        useFocusStore.getState().setComposeListSize(items.length);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleItemAction = (action: GestureAction, phrase: ComposeItem, index: number) => {
    if (section !== 'compose') return;
    switch (action.type) {
      case 'swipe':
        switch (action.direction) {
          case 'down': moveDown(); break;
          default: break;
        }
        break;
      case 'tap':
        useFocusStore.getState().setComposeIndex(index);
        if (auditoryPreview) {
          speakPreview(phrase.text.split(' ').slice(0, 4).join(' '));
        }
        break;
      case 'double-tap': {
        cancelPreview();
        // Preload the full phrase and navigate to compose
        const store = useCompositionStore.getState();
        store.preloadPhraseMode(phrase.text, 'common');
        router.push({ pathname: '/(app)/compose', params: { type: 'common', value: phrase.text } } as never);
        break;
      }
    }
  };

  const renderItem = ({ item, index }: { item: ComposeItem; index: number }) => (
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
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.headerLabel}>Common Phrases</Text>
              <Text style={styles.headerTime}>{TIME_LABELS[timeOfDay]}</Text>
            </View>
            <Pressable style={styles.closeButton} onPress={() => router.back()}>
              <Text style={styles.closeText}>X</Text>
            </Pressable>
          </View>
        </View>
      }
      itemsContent={
        loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#E07B2E" />
          </View>
        ) : (
          <FlatList
            data={phrases}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
          />
        )
      }
      onPhraseSave={() => {}}
      onPhraseNavigateUp={() => setSection('compose')}
    />
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: LAYOUT.screenPadding,
    paddingVertical: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
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
  headerLabel: {
    fontSize: TYPOGRAPHY.itemLabel.size,
    color: '#6B6B6B',
  },
  headerTime: {
    fontSize: TYPOGRAPHY.phraseBar.size,
    fontWeight: '600',
    color: '#1A1A1A',
    marginTop: 4,
  },
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
});
