import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WheelPicker } from '../../components/shared/WheelPicker';
import { StarterCard } from '../../components/home/StarterCard';
import { ErrorBoundary } from '../../components/shared/ErrorBoundary';
import { useCompositionStore } from '../../stores/composition';
import { useAuthStore } from '../../stores/auth';
import { getTimeOfDay } from '../../services/context';
import { getPredictions, getCommonPhrases } from '../../services/predictions';
import { INTENTS, DEFAULT_INTENT_BY_TIME } from '../../constants/intents';
import { LAYOUT } from '../../constants/config';
import { supabase } from '../../services/supabase';
import type { GestureAction, WheelPickerItem, SavedPhrase, ComposeItem } from '../../types';

const INTRO_SEEN_KEY = 'darevocem_intro_phrase_seen';

declare const __DEV__: boolean;

export default function HomeScreen() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [commonPhrases, setCommonPhrases] = useState<ComposeItem[]>([]);
  const [savedPhrases, setSavedPhrases] = useState<SavedPhrase[]>([]);
  const [dataStatus, setDataStatus] = useState({ common: 'loading', saved: 'loading' } as { common: string; saved: string });
  const [recordMode, setRecordMode] = useState<'record' | 'keyboard'>('record');
  const [keyboardText, setKeyboardText] = useState('');
  const keyboardRef = useRef<TextInput>(null);
  const [introPhrase, setIntroPhrase] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Show the aphasia intro phrase once after onboarding
  useEffect(() => {
    AsyncStorage.getItem(INTRO_SEEN_KEY).then((seen) => {
      if (seen) return;
      // Find the intro phrase in saved_phrases
      supabase
        .from('saved_phrases')
        .select('text')
        .ilike('category', 'introductions')
        .ilike('text', '%aphasia%')
        .limit(1)
        .then(({ data }) => {
          if (data && data.length > 0) {
            setIntroPhrase(data[0].text);
          }
        });
    });
  }, []);

  const dismissIntro = useCallback(() => {
    AsyncStorage.setItem(INTRO_SEEN_KEY, 'true');
    setIntroPhrase(null);
  }, []);

  // Fetch AI-generated common phrases and saved phrases on mount
  useEffect(() => {
    const timeOfDay = getTimeOfDay();

    getCommonPhrases(timeOfDay)
      .then((phrases) => {
        setCommonPhrases(phrases);
        setDataStatus((prev) => ({ ...prev, common: `ok:${phrases.length}` }));
      })
      .catch((err) => {
        setDataStatus((prev) => ({ ...prev, common: `err:${err?.message ?? 'unknown'}` }));
      });

    supabase
      .from('saved_phrases')
      .select('*')
      .order('sort_order')
      .limit(10)
      .then(({ data, error }) => {
        if (error) {
          setDataStatus((prev) => ({ ...prev, saved: `err:${error.message}` }));
        } else {
          if (data) setSavedPhrases(data);
          setDataStatus((prev) => ({ ...prev, saved: `ok:${data?.length ?? 0}` }));
        }
      });
  }, []);

  // Record card: single tap toggles between record/keyboard mode
  const handleRecordTap = useCallback(() => {
    if (recordMode === 'record') {
      setRecordMode('keyboard');
      setTimeout(() => keyboardRef.current?.focus(), 100);
    } else {
      setRecordMode('record');
      setKeyboardText('');
    }
  }, [recordMode]);

  // Keyboard submit: start compose with typed text
  const handleKeyboardSubmit = useCallback(() => {
    if (keyboardText.trim()) {
      const text = keyboardText.trim();
      const store = useCompositionStore.getState();
      store.preload(text, []);
      store.setLoading(true);

      getPredictions(text, getTimeOfDay())
        .then((predictions) => {
          useCompositionStore.getState().setPredictions(predictions);
        })
        .finally(() => {
          useCompositionStore.getState().setLoading(false);
        });

      setKeyboardText('');
      setRecordMode('record');
      router.push({ pathname: '/(app)/compose', params: { type: 'prediction', value: text } } as never);
    }
  }, [keyboardText, router]);

  // Build the wheel picker items: 3 predicted + 2 common + 2 saved
  const starterCards: WheelPickerItem[] = useMemo(() => {
    const timeOfDay = getTimeOfDay();
    const defaultIdx = DEFAULT_INTENT_BY_TIME[timeOfDay] ?? 0;

    // 3 Predicted intents — reordered so time-relevant is first
    const intentCards: WheelPickerItem[] = INTENTS.map((intent, i) => ({
      id: `intent-${i}`,
      text: intent.text,
      itemType: 'prediction' as const,
      color: '#E07B2E',
      metadata: { addsToPhrase: intent.addsToPhrase, originalIndex: i },
    }));
    if (defaultIdx > 0 && defaultIdx < intentCards.length) {
      const [defaultCard] = intentCards.splice(defaultIdx, 1);
      intentCards.unshift(defaultCard);
    }

    // 2 Common phrases — AI-generated full sentences
    const commonCards: WheelPickerItem[] = commonPhrases.slice(0, 2).map((phrase, i) => ({
      id: `common-${i}`,
      text: phrase.text,
      itemType: 'common' as const,
      color: '#2B7A78',
      metadata: { value: phrase.text },
    }));

    // 2 Saved phrases — personal data from profile
    const savedCards: WheelPickerItem[] = savedPhrases.slice(0, 2).map((phrase) => ({
      id: `saved-${phrase.id}`,
      text: phrase.text,
      itemType: 'saved' as const,
      color: '#7B68AE',
      metadata: { category: phrase.category },
    }));

    return [
      ...intentCards.slice(0, 3),
      ...commonCards,
      ...savedCards,
    ];
  }, [commonPhrases, savedPhrases]);

  const handleGesture = useCallback(
    (gesture: GestureAction, item: WheelPickerItem, _index: number) => {
      if (gesture.type !== 'double-tap') return;

      const store = useCompositionStore.getState();

      if (item.itemType === 'prediction') {
        // Predicted intent: start compose in predict mode
        const intentText = item.text;
        store.preload(intentText, []);
        store.setLoading(true);

        getPredictions(intentText, getTimeOfDay())
          .then((predictions) => {
            useCompositionStore.getState().setPredictions(predictions);
          })
          .finally(() => {
            useCompositionStore.getState().setLoading(false);
          });

        router.push({ pathname: '/(app)/compose', params: { type: 'prediction', value: intentText } } as never);
      } else if (item.itemType === 'common') {
        // Common phrase: start compose in phrase mode with this phrase
        const text = (item.metadata?.value as string) ?? item.text;
        store.preloadPhraseMode(text, 'common');

        router.push({ pathname: '/(app)/compose', params: { type: 'common', value: text } } as never);
      } else if (item.itemType === 'saved') {
        // Saved phrase: start compose in phrase mode with this phrase
        store.preloadPhraseMode(item.text, 'saved');

        router.push({ pathname: '/(app)/compose', params: { type: 'saved', value: item.text } } as never);
      }
    },
    [router],
  );

  const renderItem = useCallback(
    (item: WheelPickerItem, isFocused: boolean) => (
      <StarterCard item={item} isFocused={isFocused} />
    ),
    [],
  );

  return (
    <ErrorBoundary>
      <SafeAreaView style={styles.container}>
        {/* Nav bar with hamburger */}
        <View style={styles.nav}>
          <Pressable onPress={() => setMenuOpen((v) => !v)} hitSlop={12}>
            <Text style={styles.navIcon}>☰</Text>
          </Pressable>
          <Text style={styles.title}>DARE VOCEM</Text>
          <View style={{ width: 34 }} />
        </View>

        {/* Hamburger menu */}
        {menuOpen && (
          <View style={styles.menu}>
            <Pressable
              style={styles.menuItem}
              onPress={() => { setMenuOpen(false); router.push('/(app)/profile' as never); }}
            >
              <Text style={styles.menuItemText}>Profile</Text>
            </Pressable>
            <Pressable
              style={[styles.menuItem, { borderBottomWidth: 0 }]}
              onPress={() => { setMenuOpen(false); router.push('/(app)/settings' as never); }}
            >
              <Text style={styles.menuItemText}>Settings</Text>
            </Pressable>
          </View>
        )}

        {/* Keyboard input card (Record placeholder — mic not yet implemented) */}
        <Pressable
          style={[
            styles.recordCard,
            recordMode === 'keyboard' && styles.recordCardActive,
          ]}
          onPress={handleRecordTap}
        >
          {recordMode === 'record' ? (
            <>
              <Text style={styles.recordIcon}>mic</Text>
              <Text style={styles.recordText}>Record</Text>
              <Text style={styles.recordHint}>Tap for keyboard</Text>
            </>
          ) : (
            <View style={styles.keyboardRow}>
              <TextInput
                ref={keyboardRef}
                style={styles.keyboardInput}
                value={keyboardText}
                onChangeText={setKeyboardText}
                placeholder="Type what you want to say..."
                placeholderTextColor="#A0A0A0"
                returnKeyType="go"
                onSubmitEditing={handleKeyboardSubmit}
              />
              {keyboardText.trim().length > 0 && (
                <Pressable style={styles.goButton} onPress={handleKeyboardSubmit}>
                  <Text style={styles.goButtonText}>Go</Text>
                </Pressable>
              )}
            </View>
          )}
        </Pressable>

        {/* Intro phrase — shown once after onboarding */}
        {introPhrase && (
          <View style={styles.introBanner}>
            <Text style={styles.introBannerLabel}>Your introduction phrase</Text>
            <Text style={styles.introBannerText}>{introPhrase}</Text>
            <Text style={styles.introBannerHint}>
              Find this anytime in Saved &gt; Introductions
            </Text>
            <Pressable style={styles.introDismiss} onPress={dismissIntro}>
              <Text style={styles.introDismissText}>Got it</Text>
            </Pressable>
          </View>
        )}

        {/* Debug: data loading status */}
        {__DEV__ && (
          <Text style={styles.debugStatus}>
            P:{starterCards.filter((c) => c.itemType === 'prediction').length}{' '}
            C:{starterCards.filter((c) => c.itemType === 'common').length}({dataStatus.common}){' '}
            S:{starterCards.filter((c) => c.itemType === 'saved').length}({dataStatus.saved}){' '}
            Total:{starterCards.length}
          </Text>
        )}

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
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: LAYOUT.screenPadding,
    paddingVertical: 12,
  },
  navIcon: {
    fontSize: 18,
    color: '#1A1A1A',
    padding: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A1A',
    letterSpacing: 6,
    textAlign: 'center',
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
  },
  recordCardActive: {
    borderLeftColor: '#2B7A78',
    backgroundColor: '#FAFAF7',
  },
  recordIcon: {
    fontSize: 18,
    fontWeight: '600',
    color: '#E07B2E',
    marginRight: 12,
  },
  recordText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1A1A1A',
    flex: 1,
  },
  recordHint: {
    fontSize: 14,
    color: '#6B6B6B',
  },
  keyboardRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  keyboardInput: {
    flex: 1,
    fontSize: 18,
    color: '#1A1A1A',
    paddingVertical: 0,
  },
  goButton: {
    backgroundColor: '#E07B2E',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginLeft: 12,
  },
  goButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  debugStatus: {
    fontSize: 11,
    color: '#999',
    textAlign: 'center',
    paddingBottom: 4,
    fontFamily: 'monospace',
  },
  menu: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: LAYOUT.screenPadding,
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden' as const,
    borderWidth: 1,
    borderColor: '#E5E5E0',
  },
  menuItem: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0EB',
  },
  menuItemText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#1A1A1A',
  },
  introBanner: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: LAYOUT.screenPadding,
    marginBottom: 16,
    borderRadius: 12,
    padding: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#7B68AE',
  },
  introBannerLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7B68AE',
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    marginBottom: 8,
  },
  introBannerText: {
    fontSize: 17,
    color: '#1A1A1A',
    lineHeight: 24,
    marginBottom: 8,
  },
  introBannerHint: {
    fontSize: 13,
    color: '#6B6B6B',
    marginBottom: 12,
  },
  introDismiss: {
    alignSelf: 'flex-end' as const,
    backgroundColor: '#7B68AE',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  introDismissText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
