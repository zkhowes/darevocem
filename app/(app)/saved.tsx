import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { SectionLayout } from '../../components/sections/SectionLayout';
import { CategoryHeader } from '../../components/sections/CategoryHeader';
import { WheelPicker } from '../../components/shared/WheelPicker';
import { useFocusStore } from '../../stores/focus';
import { useCompositionStore } from '../../stores/composition';
import { usePreferencesStore } from '../../stores/preferences';
import { speakPreview, cancelPreview } from '../../services/auditoryPreview';
import { speakPhrase, speakSystem } from '../../services/tts';
import { supabase } from '../../services/supabase';
import { savePhrase } from '../../utils/savePhrase';
import { useAuthStore } from '../../stores/auth';
import { formatTodaySpoken } from '../../utils/profileSeeding';
import { LAYOUT, TYPOGRAPHY } from '../../constants/config';
import type { GestureAction, SavedPhrase, WheelPickerItem } from '../../types';

const CATEGORIES = ['Personal'];
const SAVED_COLOR = '#7B68AE';

function resolveDynamicPhrase(phrase: SavedPhrase): SavedPhrase {
  if (phrase.label === 'Today') {
    const today = formatTodaySpoken();
    return { ...phrase, text: today, value: today };
  }
  return phrase;
}

interface ParsedItem {
  id: string;
  label: string | null;
  value: string;
  isVariable: boolean;
}

function parseItem(item: SavedPhrase): ParsedItem {
  let label = item.label ?? null;
  let value = item.value ?? item.text;
  // Backward compat for old "Label = Value" format
  if (!label && item.text.includes(' = ')) {
    const eqIdx = item.text.indexOf(' = ');
    label = item.text.slice(0, eqIdx);
    value = item.text.slice(eqIdx + 3);
  }
  return { id: item.id, label, value, isVariable: !!label };
}

export default function SavedScreen() {
  const router = useRouter();
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [contextMenuVisible, setContextMenuVisible] = useState(false);
  const [pendingItem, setPendingItem] = useState<ParsedItem | null>(null);

  const composeIndex = useFocusStore((s) => s.composeIndex);
  const setComposeIndex = useFocusStore((s) => s.setComposeIndex);
  const setSection = useFocusStore((s) => s.setSection);
  const setComposeListSize = useFocusStore((s) => s.setComposeListSize);
  const focusReset = useFocusStore((s) => s.reset);
  const auditoryPreview = usePreferencesStore((s) => s.auditoryPreview);

  // Clear stale composition state on mount — Saved screen builds its own phrase
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
        const parsed = data.map(resolveDynamicPhrase).map(parseItem);
        setItems(parsed);
        setComposeListSize(parsed.length);
      }
    }
    fetchPhrases();
  }, [category]);

  const wheelItems: WheelPickerItem[] = items.map((it) => ({
    id: it.id,
    text: it.isVariable && it.label ? it.label : it.value,
    itemType: 'saved',
    color: SAVED_COLOR,
    metadata: { value: it.value, label: it.label, isVariable: it.isVariable },
  }));

  // Speak label for variables ("Date of birth"), value for plain phrases
  const previewFor = useCallback((it: ParsedItem): string => {
    return it.isVariable && it.label ? it.label : it.value;
  }, []);

  const handleFocusChange = useCallback((index: number) => {
    setComposeIndex(index);
    const it = items[index];
    if (it && auditoryPreview) {
      speakPreview(previewFor(it));
    }
  }, [items, auditoryPreview, previewFor, setComposeIndex]);

  // Double-tap on wheel: add the value to the phrase bar (in-place, no nav).
  // For variables, the value is the actual data ("March 24, 1985"), not the label.
  const handleGesture = useCallback(
    (gesture: GestureAction, _item: WheelPickerItem, index: number) => {
      const it = items[index];
      if (!it) return;
      switch (gesture.type) {
        case 'double-tap': {
          cancelPreview();
          const store = useCompositionStore.getState();
          // If nothing composed yet, set as intent so it shows in phrase bar.
          // Otherwise append as a slot.
          if (!store.intent && store.slots.length === 0) {
            store.setIntent(it.value);
          } else {
            store.addSlot(it.value);
          }
          break;
        }
        case 'long-press':
          setPendingItem(it);
          setContextMenuVisible(true);
          break;
      }
    },
    [items],
  );

  // Long-press → "Compose": navigate to Compose with the phrase preloaded,
  // ready to extend with AI predictions.
  const handleSwitchToCompose = useCallback(() => {
    setContextMenuVisible(false);
    if (!pendingItem) return;
    const store = useCompositionStore.getState();
    // Preload as if the user had picked this from Home, then navigate.
    store.preloadSavedPhrase(pendingItem.value);
    setPendingItem(null);
    router.push({
      pathname: '/(app)/compose',
      params: { type: 'saved', value: pendingItem.value },
    } as never);
  }, [pendingItem, router]);

  // Double-tap on phrase bar speaks the composed phrase, then resets and returns
  // home. Without the return, the phrase stays live on this screen and further
  // double-taps append to it and respeak. The ref guards against a second speak
  // firing while one is already in flight.
  const isSpeakingRef = useRef(false);
  const handlePhraseSpeak = useCallback(async () => {
    if (isSpeakingRef.current) return;
    const phrase = useCompositionStore.getState().getPhrase();
    if (!phrase) return;
    cancelPreview();
    isSpeakingRef.current = true;
    try {
      await speakPhrase(phrase, {
        onDone: () => {
          isSpeakingRef.current = false;
          useCompositionStore.getState().reset();
          router.back();
        },
      });
    } catch {
      isSpeakingRef.current = false;
    }
  }, [router]);

  // Swipe up on the phrase bar saves the composed phrase (spoken + visual).
  const handlePhraseSave = useCallback(async () => {
    const phrase = useCompositionStore.getState().getPhrase();
    if (!phrase) return;
    const { Alert } = require('react-native');
    const userId = useAuthStore.getState().session?.user?.id;
    if (!userId) {
      Alert.alert('Sign in to save', 'Sign in again to save this phrase.');
      return;
    }
    try {
      await savePhrase(supabase, userId, phrase);
      speakSystem('Saved');
      Alert.alert('Saved', `"${phrase.slice(0, 60)}"`);
    } catch {
      Alert.alert("Couldn't save", 'Please try again.');
    }
  }, []);

  const renderItem = useCallback(
    (item: WheelPickerItem, isFocused: boolean) => {
      const isVar = item.metadata?.isVariable as boolean | undefined;
      const label = item.metadata?.label as string | undefined;
      const value = item.metadata?.value as string | undefined;
      return (
        <View style={styles.itemContent}>
          {isVar && label ? (
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemLabel, isFocused && styles.focusedLabel]}>{label}</Text>
              <Text
                style={isFocused ? styles.focusedText : styles.itemText}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >
                {value}
              </Text>
            </View>
          ) : (
            <Text
              style={isFocused ? styles.focusedText : styles.itemText}
              numberOfLines={3}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
            >
              {value ?? item.text}
            </Text>
          )}
        </View>
      );
    },
    [],
  );

  return (
    <>
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
          <WheelPicker
            items={wheelItems}
            focusedIndex={composeIndex}
            onFocusChange={handleFocusChange}
            onGesture={handleGesture}
            renderItem={renderItem}
          />
        }
        onPhraseSave={handlePhraseSave}
        onPhraseNavigateUp={() => setSection('compose')}
        onPhraseSpeak={handlePhraseSpeak}
      />

      {/* Long-press → switch to predict mode in Compose */}
      <Modal
        visible={contextMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setContextMenuVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setContextMenuVisible(false)}>
          <View style={styles.contextMenu}>
            <Text style={styles.contextMenuTitle}>
              {pendingItem
                ? `"${(pendingItem.isVariable && pendingItem.label
                    ? pendingItem.label
                    : pendingItem.value
                  ).slice(0, 40)}"`
                : ''}
            </Text>
            <Pressable style={styles.contextMenuItem} onPress={handleSwitchToCompose}>
              <Text style={styles.contextMenuText}>Compose</Text>
              <Text style={styles.contextMenuHint}>Add to this phrase with predictions</Text>
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
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  itemLabel: {
    fontSize: TYPOGRAPHY.itemLabel.size,
    color: '#6B6B6B',
    marginBottom: 2,
  },
  focusedLabel: {
    color: 'rgba(255, 255, 255, 0.7)',
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
    fontSize: 14,
    color: '#6B6B6B',
    marginBottom: 16,
    textAlign: 'center',
  },
  contextMenuItem: {
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E0',
  },
  contextMenuText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#E07B2E',
    textAlign: 'center',
  },
  contextMenuHint: {
    fontSize: 13,
    color: '#6B6B6B',
    textAlign: 'center',
    marginTop: 4,
  },
  contextMenuCancel: {
    marginTop: 8,
  },
  contextMenuCancelText: {
    fontSize: 16,
    color: '#6B6B6B',
    textAlign: 'center',
  },
});
