import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable, Modal } from 'react-native';

declare const __DEV__: boolean;
import { useRouter } from 'expo-router';
import { SectionLayout } from '../../components/sections/SectionLayout';
import { WheelPicker } from '../../components/shared/WheelPicker';
import { useFocusStore } from '../../stores/focus';
import { useCompositionStore } from '../../stores/composition';
import { usePreferencesStore } from '../../stores/preferences';
import { speakPreview, cancelPreview } from '../../services/auditoryPreview';
import { speakPhrase, speakSystem } from '../../services/tts';
import { supabase } from '../../services/supabase';
import { savePhrase } from '../../utils/savePhrase';
import { copyPhrase } from '../../utils/copyPhrase';
import { useAuthStore } from '../../stores/auth';
import { getCommonPhrases } from '../../services/predictions';
import { getTimeOfDay } from '../../services/context';
import { LAYOUT, TYPOGRAPHY } from '../../constants/config';
import type { GestureAction, ComposeItem, WheelPickerItem } from '../../types';

const TIME_LABELS = {
  morning: 'Good Morning',
  afternoon: 'Good Afternoon',
  evening: 'Good Evening',
  night: 'Good Night',
} as const;

const COMMON_COLOR = '#2B7A78';

export default function CommonScreen() {
  const router = useRouter();
  const [phrases, setPhrases] = useState<ComposeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [contextMenuVisible, setContextMenuVisible] = useState(false);
  const [pendingPhrase, setPendingPhrase] = useState<string | null>(null);
  // Phrase-bar long-press menu (Save + Copy for the composed phrase). Separate
  // from the wheel-item menu above, which acts on the long-pressed Common item.
  const [phraseMenuVisible, setPhraseMenuVisible] = useState(false);

  const composeIndex = useFocusStore((s) => s.composeIndex);
  const setComposeIndex = useFocusStore((s) => s.setComposeIndex);
  const setSection = useFocusStore((s) => s.setSection);
  const setComposeListSize = useFocusStore((s) => s.setComposeListSize);
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
        setComposeListSize(items.length);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const wheelItems: WheelPickerItem[] = phrases.map((p) => ({
    id: p.id,
    text: p.text,
    itemType: 'common',
    color: COMMON_COLOR,
    metadata: { rank: p.rank },
  }));

  const handleFocusChange = useCallback((index: number) => {
    setComposeIndex(index);
    const item = phrases[index];
    if (item && auditoryPreview) {
      speakPreview(item.text);
    }
  }, [phrases, auditoryPreview, setComposeIndex]);

  // Double-tap on wheel: set the phrase as the intent (in-place, no nav)
  const handleGesture = useCallback(
    (gesture: GestureAction, _item: WheelPickerItem, index: number) => {
      const phrase = phrases[index];
      if (!phrase) return;
      switch (gesture.type) {
        case 'double-tap': {
          cancelPreview();
          const store = useCompositionStore.getState();
          // Replace the whole phrase — common phrases are complete sentences
          store.reset();
          store.setIntent(phrase.text);
          break;
        }
        case 'long-press':
          setPendingPhrase(phrase.text);
          setContextMenuVisible(true);
          break;
      }
    },
    [phrases],
  );

  const handleSwitchToCompose = useCallback(() => {
    setContextMenuVisible(false);
    if (!pendingPhrase) return;
    const store = useCompositionStore.getState();
    store.preloadPhraseMode(pendingPhrase, 'common');
    const phrase = pendingPhrase;
    setPendingPhrase(null);
    router.push({
      pathname: '/(app)/compose',
      params: { type: 'common', value: phrase },
    } as never);
  }, [pendingPhrase, router]);

  // Long-press wheel item → "Copy": put that Common phrase directly on the
  // clipboard so the user can send it without composing first.
  const handleCopyItem = useCallback(() => {
    setContextMenuVisible(false);
    if (!pendingPhrase) return;
    const phrase = pendingPhrase;
    setPendingPhrase(null);
    copyPhrase(phrase);
  }, [pendingPhrase]);

  // Speak the composed phrase, then reset and return home — otherwise the
  // phrase stays live here and further double-taps append + respeak. The ref
  // guards against a second speak firing mid-playback.
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

  // Phrase-bar long-press menu: copy the composed phrase to the clipboard.
  const handlePhraseCopy = useCallback(() => {
    setPhraseMenuVisible(false);
    const phrase = useCompositionStore.getState().getPhrase();
    if (phrase) copyPhrase(phrase);
  }, []);

  // Phrase-bar long-press menu: save the composed phrase (wraps the swipe-up
  // save handler; closes the menu first so the alert isn't behind the modal).
  const handlePhraseSaveFromMenu = useCallback(() => {
    setPhraseMenuVisible(false);
    handlePhraseSave();
  }, [handlePhraseSave]);

  const renderItem = useCallback(
    (item: WheelPickerItem, isFocused: boolean) => (
      <View style={styles.itemContent}>
        {/* C# index — dev-only; testers shouldn't see internal labels. */}
        {__DEV__ && (
          <Text style={[styles.itemLabel, isFocused && styles.focusedLabel]}>
            C{(item.metadata?.rank as number ?? 0) + 1}
          </Text>
        )}
        <Text
          style={isFocused ? styles.focusedText : styles.itemText}
          numberOfLines={3}
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
    <>
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
            <WheelPicker
              items={wheelItems}
              focusedIndex={composeIndex}
              onFocusChange={handleFocusChange}
              onGesture={handleGesture}
              renderItem={renderItem}
            />
          )
        }
        onPhraseSave={handlePhraseSave}
        onPhraseNavigateUp={() => setSection('compose')}
        onPhraseSpeak={handlePhraseSpeak}
        onPhraseLongPress={() => setPhraseMenuVisible(true)}
      />

      <Modal
        visible={contextMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setContextMenuVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setContextMenuVisible(false)}>
          <View style={styles.contextMenu}>
            <Text style={styles.contextMenuTitle}>
              {pendingPhrase ? `"${pendingPhrase.slice(0, 40)}${pendingPhrase.length > 40 ? '...' : ''}"` : ''}
            </Text>
            <Pressable style={styles.contextMenuItem} onPress={handleSwitchToCompose}>
              <Text style={styles.contextMenuText}>Compose</Text>
              <Text style={styles.contextMenuHint}>Add to this phrase with predictions</Text>
            </Pressable>
            <Pressable style={styles.contextMenuItem} onPress={handleCopyItem}>
              <Text style={styles.contextMenuText}>Copy</Text>
              <Text style={styles.contextMenuHint}>Put this phrase on the clipboard</Text>
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

      {/* Phrase-bar long-press: Save or Copy the composed phrase. */}
      <Modal
        visible={phraseMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPhraseMenuVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setPhraseMenuVisible(false)}>
          <View style={styles.contextMenu}>
            <Pressable style={styles.contextMenuItem} onPress={handlePhraseSaveFromMenu}>
              <Text style={styles.contextMenuText}>Save phrase</Text>
              <Text style={styles.contextMenuHint}>Add it to your Saved list</Text>
            </Pressable>
            <Pressable style={styles.contextMenuItem} onPress={handlePhraseCopy}>
              <Text style={styles.contextMenuText}>Copy</Text>
              <Text style={styles.contextMenuHint}>Put the phrase on the clipboard</Text>
            </Pressable>
            <Pressable
              style={[styles.contextMenuItem, styles.contextMenuCancel]}
              onPress={() => setPhraseMenuVisible(false)}
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
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  itemLabel: {
    fontSize: TYPOGRAPHY.itemLabel.size,
    color: '#6B6B6B',
    marginRight: 8,
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
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
