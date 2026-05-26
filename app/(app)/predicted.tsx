import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { SectionLayout } from '../../components/sections/SectionLayout';
import { WheelPicker } from '../../components/shared/WheelPicker';
import { useFocusStore } from '../../stores/focus';
import { useCompositionStore } from '../../stores/composition';
import { usePreferencesStore } from '../../stores/preferences';
import { speakPreview, cancelPreview } from '../../services/auditoryPreview';
import { getIntentStarters } from '../../services/predictions';
import { getTimeOfDay } from '../../services/context';
import { openIntent } from '../../utils/openIntent';
import { INTENTS } from '../../constants/intents';
import { LAYOUT, TYPOGRAPHY } from '../../constants/config';
import type { GestureAction, WheelPickerItem } from '../../types';

const PREDICTED_COLOR = '#C75D3C';
// How many AI starters to request per "load more". A generous fixed ceiling on
// total appends keeps the list big without being unbounded.
const PAGE_SIZE = 15;
const MAX_STARTERS = 90;

export default function PredictedScreen() {
  const router = useRouter();
  // Page 1 is the curated INTENTS — instant, offline, never blank. AI-generated
  // starters append below as the user scrolls toward the end.
  const [starters, setStarters] = useState<string[]>(() => INTENTS.map((i) => i.text));
  const [loadingMore, setLoadingMore] = useState(false);
  const exhaustedRef = useRef(false);
  const loadingRef = useRef(false);

  const composeIndex = useFocusStore((s) => s.composeIndex);
  const setComposeIndex = useFocusStore((s) => s.setComposeIndex);
  const setSection = useFocusStore((s) => s.setSection);
  const setComposeListSize = useFocusStore((s) => s.setComposeListSize);
  const focusReset = useFocusStore((s) => s.reset);
  const auditoryPreview = usePreferencesStore((s) => s.auditoryPreview);

  const timeOfDay = getTimeOfDay();

  // Clear stale composition state on mount.
  useEffect(() => {
    useCompositionStore.getState().reset();
    focusReset();
  }, []);

  useEffect(() => {
    setComposeListSize(starters.length);
  }, [starters.length, setComposeListSize]);

  // Append a page of AI-generated starters, excluding what's already shown so
  // pages don't repeat. Never blanks the list — on failure getIntentStarters
  // returns curated items, and we simply stop if nothing new comes back.
  const loadMore = useCallback(async () => {
    if (loadingRef.current || exhaustedRef.current) return;
    if (starters.length >= INTENTS.length + MAX_STARTERS) {
      exhaustedRef.current = true;
      return;
    }
    loadingRef.current = true;
    setLoadingMore(true);
    try {
      const fresh = await getIntentStarters(starters.length, PAGE_SIZE, timeOfDay, starters);
      const seen = new Set(starters.map((s) => s.toLowerCase()));
      const unique = fresh.filter((s) => !seen.has(s.toLowerCase()));
      if (unique.length === 0) {
        exhaustedRef.current = true;
      } else {
        setStarters((prev) => [...prev, ...unique]);
      }
    } finally {
      loadingRef.current = false;
      setLoadingMore(false);
    }
  }, [starters, timeOfDay]);

  const wheelItems: WheelPickerItem[] = starters.map((text, i) => ({
    id: `starter-${i}-${text}`,
    text,
    itemType: 'prediction',
    color: PREDICTED_COLOR,
  }));

  const handleFocusChange = useCallback(
    (index: number) => {
      setComposeIndex(index);
      const text = starters[index];
      if (text && auditoryPreview) speakPreview(text);
      // Prefetch more as the user nears the end of the loaded list.
      if (index >= starters.length - 2) loadMore();
    },
    [starters, auditoryPreview, setComposeIndex, loadMore],
  );

  // Double-tap selects the starter and opens compose — identical to tapping a
  // P1/P2/P3 card on Home (shared openIntent).
  const handleGesture = useCallback(
    (gesture: GestureAction, _item: WheelPickerItem, index: number) => {
      const text = starters[index];
      if (!text) return;
      if (gesture.type === 'double-tap') {
        cancelPreview();
        openIntent(router, text);
      }
    },
    [starters, router],
  );

  const renderItem = useCallback(
    (item: WheelPickerItem, isFocused: boolean) => (
      <View style={styles.itemContent}>
        <Text
          style={isFocused ? styles.focusedText : styles.itemText}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
        >
          {item.text}
        </Text>
      </View>
    ),
    [],
  );

  return (
    <SectionLayout
      headerContent={
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.headerLabel}>Predicted</Text>
              <Text style={styles.headerTitle}>Ways to start</Text>
            </View>
            <View style={styles.headerRight}>
              {loadingMore && <ActivityIndicator size="small" color={PREDICTED_COLOR} style={styles.spinner} />}
              <Pressable style={styles.closeButton} onPress={() => router.back()}>
                <Text style={styles.closeText}>X</Text>
              </Pressable>
            </View>
          </View>
        </View>
      }
      itemsContent={
        <WheelPicker
          items={wheelItems}
          focusedIndex={composeIndex}
          onFocusChange={handleFocusChange}
          onGesture={handleGesture}
          renderItem={renderItem}
        />
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  spinner: {
    marginRight: 12,
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
  headerTitle: {
    fontSize: TYPOGRAPHY.phraseBar.size,
    fontWeight: '600',
    color: '#1A1A1A',
    marginTop: 4,
  },
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  itemText: {
    fontSize: LAYOUT.wheelPickerItemFontSize,
    fontWeight: '500',
    color: '#1A1A1A',
    flex: 1,
  },
  focusedText: {
    fontSize: LAYOUT.wheelPickerFocusedFontSize,
    fontWeight: '700',
    color: '#FFFFFF',
    flex: 1,
  },
});
