import React, { useEffect, useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SectionLayout } from '../../components/sections/SectionLayout';
import { IntentSection } from '../../components/sections/IntentSection';
import { ComposeSection } from '../../components/sections/ComposeSection';
import { PhraseComposeSection } from '../../components/sections/PhraseComposeSection';
import { ContextMenu } from '../../components/shared/ContextMenu';
import { PredictionDebug, logPredictionDebug } from '../../components/shared/PredictionDebug';
import { useFocusStore } from '../../stores/focus';
import { useCompositionStore } from '../../stores/composition';
import { getTimeOfDay } from '../../services/context';
import { getPredictions, getCommonPhrases } from '../../services/predictions';
import { speakPhrase } from '../../services/tts';
import { supabase } from '../../services/supabase';
import { LAYOUT } from '../../constants/config';
import { generateId } from '../../types';
import type { ComposeItem } from '../../types';

declare const __DEV__: boolean;

export default function ComposeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string; value?: string }>();
  const focusReset = useFocusStore((s) => s.reset);
  const setSection = useFocusStore((s) => s.setSection);
  const intent = useCompositionStore((s) => s.intent);
  const composeMode = useCompositionStore((s) => s.composeMode);
  const phraseSource = useCompositionStore((s) => s.phraseSource);
  const [intentCollapsed, setIntentCollapsed] = useState(true);
  const [contextMenuVisible, setContextMenuVisible] = useState(false);

  // On mount: load phrase-mode items or ensure predict-mode predictions exist
  useEffect(() => {
    const store = useCompositionStore.getState();
    focusReset();

    if (store.composeMode === 'phrase') {
      // Load more common or saved phrases for the compose wheel
      loadPhraseModeItems(store.phraseSource ?? 'common');
    } else {
      // Predict mode: if predictions weren't pre-fetched, fetch now
      if (store.intent && store.predictions.length === 0 && !store.isLoading) {
        store.setLoading(true);
        const fullPhrase = [store.intent, ...store.slots].filter(Boolean).join(' ');
        getPredictions(fullPhrase, getTimeOfDay())
          .then((items) => useCompositionStore.getState().setPredictions(items))
          .finally(() => useCompositionStore.getState().setLoading(false));
      }
    }
  }, []);

  async function loadPhraseModeItems(source: 'common' | 'saved') {
    const store = useCompositionStore.getState();
    store.setLoading(true);
    try {
      let items: ComposeItem[];
      if (source === 'common') {
        items = await getCommonPhrases(getTimeOfDay());
      } else {
        const { data } = await supabase
          .from('saved_phrases')
          .select('*')
          .order('sort_order')
          .limit(20);

        items = (data ?? []).map((p: { id: string; text: string; category: string }, i: number) => ({
          id: p.id,
          text: p.text,
          itemType: 'saved' as const,
          rank: i,
        }));
      }
      useCompositionStore.getState().setPredictions(items);
    } finally {
      useCompositionStore.getState().setLoading(false);
    }
  }

  // X button -> home
  const handleClose = useCallback(() => {
    useCompositionStore.getState().reset();
    router.back();
  }, [router]);

  const handleNavigateHome = useCallback(() => {
    router.back();
  }, [router]);

  // Swipe left: refine the FOCUSED item only.
  // The user is saying "this specific word isn't right, show me alternatives."
  // Other predictions on screen are untouched — they represent different paths.
  const handleAdvance = useCallback(async (item: ComposeItem) => {
    const state = useCompositionStore.getState();

    // Only record the focused item as tried — not the entire prediction list
    state.recordTriedItem(item.text);

    state.setLoading(true);
    try {
      const currentState = useCompositionStore.getState();
      const fullPhrase = [currentState.intent, ...currentState.slots].filter(Boolean).join(' ');
      const otherOptions = currentState.predictions
        .filter((p) => p.text !== item.text)
        .map((p) => p.text);

      const { data } = await supabase.functions.invoke('predict', {
        body: {
          fullPhrase,
          targetItem: item.text,
          otherVisibleOptions: otherOptions,
          triedItems: currentState.triedItems,
          requestType: 'refine',
        },
      });

      const items = (data?.predictions ?? []).map((p: { text: string }, i: number) => ({
        id: `refine-${i}-${Date.now()}`,
        text: p.text,
        itemType: 'prediction' as const,
        rank: i,
      }));

      if (__DEV__) {
        logPredictionDebug({
          timestamp: Date.now(),
          action: 'REFINE (swipe-left)',
          fullPhrase,
          focusedItem: item.text,
          triedItems: currentState.triedItems,
          predictions: items.map((p: { text: string }) => p.text),
          latencyMs: data?.debug?.latencyMs,
          source: items.length > 0 ? (data?.fallback ? 'fallback' : 'claude') : 'empty',
        });
      }

      if (items.length > 0) {
        useCompositionStore.getState().refine(item.text, items);
      }
    } finally {
      useCompositionStore.getState().setLoading(false);
    }
  }, []);

  // Swipe right: backtrack — pop prediction history to go back one step.
  // If no history, this is a no-op (user is already at the start).
  const handleBacktrack = useCallback(async () => {
    const state = useCompositionStore.getState();
    state.backtrack();
  }, []);

  const handleModifierTap = useCallback(async (item: ComposeItem) => {
    // Only in predict mode
    if (useCompositionStore.getState().composeMode !== 'predict') return;

    const state = useCompositionStore.getState();
    if (state.modifierState && state.modifierState.targetItem === item.text) {
      state.cycleModifier();
    } else {
      const { getModifiers } = await import('../../services/predictions');
      const { FALLBACK_MODIFIERS } = await import('../../constants/fallbacks');
      try {
        const fullPhrase = [state.intent, ...state.slots].filter(Boolean).join(' ');
        const modifiers = await getModifiers(fullPhrase, item.text);
        state.setModifiers(item.text, modifiers.length > 0 ? modifiers : FALLBACK_MODIFIERS);
      } catch {
        state.setModifiers(item.text, FALLBACK_MODIFIERS);
      }
    }
  }, []);

  // Double-tap: select the focused word, add it to the phrase, fetch next predictions.
  const handleSelect = useCallback(async (item: ComposeItem) => {
    const state = useCompositionStore.getState();
    const selectedText = state.modifierState?.targetItem === item.text
      ? state.getModifierDisplayText() ?? (item.value ?? item.text)
      : (item.value ?? item.text);

    state.addSlot(selectedText);
    state.clearModifier();
    // Clear tried items — new word means fresh prediction space
    state.clearTriedItems();
    state.setLoading(true);
    try {
      const freshState = useCompositionStore.getState();
      const fullPhrase = [freshState.intent, ...freshState.slots].filter(Boolean).join(' ');
      const nextPredictions = await getPredictions(
        fullPhrase,
        getTimeOfDay(),
      );

      if (__DEV__) {
        logPredictionDebug({
          timestamp: Date.now(),
          action: `SELECT "${selectedText}"`,
          fullPhrase,
          triedItems: [],
          predictions: nextPredictions.map((p) => p.text),
          source: 'next',
        });
      }

      useCompositionStore.getState().setPredictions(nextPredictions);
    } finally {
      useCompositionStore.getState().setLoading(false);
    }
  }, []);

  // In phrase mode: double-tap replaces the current phrase entirely
  const handlePhraseSelect = useCallback((text: string) => {
    const store = useCompositionStore.getState();
    // Replace intent (shown in intent bar and phrase bar)
    store.preloadPhraseMode(text, store.phraseSource ?? 'common');
    // Reload phrase items so the wheel stays populated
    loadPhraseModeItems(store.phraseSource ?? 'common');
  }, []);

  // In phrase mode: long-press -> "Compose" switches to predict mode
  const handleSwitchToPredict = useCallback(async () => {
    const store = useCompositionStore.getState();
    store.switchToPredictMode();

    const freshState = useCompositionStore.getState();
    const fullPhrase = [freshState.intent, ...freshState.slots].filter(Boolean).join(' ');
    try {
      const items = await getPredictions(fullPhrase, getTimeOfDay());
      useCompositionStore.getState().setPredictions(items);
    } finally {
      useCompositionStore.getState().setLoading(false);
    }
  }, []);

  // Double-tap on phrase bar: speak the composed phrase
  const handlePhraseSpeak = useCallback(async () => {
    const phrase = useCompositionStore.getState().getPhrase();
    if (!phrase) return;
    await speakPhrase(phrase, {
      onDone: () => {
        useCompositionStore.getState().reset();
        router.back();
      },
    });
  }, [router]);

  const handlePhraseSave = useCallback(() => {
    // Save current phrase to saved_phrases
    const phrase = useCompositionStore.getState().getPhrase();
    if (!phrase) return;
    // TODO: wire up save to supabase
  }, []);

  const handlePhraseNavigateUp = useCallback(() => {
    setSection('compose');
  }, []);

  return (
    <View style={styles.container}>
      {/* Dev-only prediction debug overlay */}
      <PredictionDebug />

      {/* X close button */}
      <Pressable style={styles.closeButton} onPress={handleClose}>
        <Text style={styles.closeText}>X</Text>
      </Pressable>

      <ContextMenu
        visible={contextMenuVisible}
        onClose={() => setContextMenuVisible(false)}
        onKeyboard={() => {
          // TODO: open keyboard input overlay
          setContextMenuVisible(false);
        }}
        onSave={handlePhraseSave}
      />

      <SectionLayout
        headerContent={
          <IntentSection
            onNavigateHome={handleNavigateHome}
            timeOfDay={getTimeOfDay()}
            collapsed={intentCollapsed}
            onExpand={() => setIntentCollapsed(false)}
            initialIntent={intent ?? undefined}
          />
        }
        itemsContent={
          composeMode === 'predict' ? (
            <ComposeSection
              onAdvance={handleAdvance}
              onBacktrack={handleBacktrack}
              onModifierTap={handleModifierTap}
              onSelect={handleSelect}
              onLongPress={() => setContextMenuVisible(true)}
            />
          ) : (
            <PhraseComposeSection
              onPhraseSelect={handlePhraseSelect}
              onSwitchToPredict={handleSwitchToPredict}
            />
          )
        }
        onPhraseSave={handlePhraseSave}
        onPhraseNavigateUp={handlePhraseNavigateUp}
        onPhraseSpeak={handlePhraseSpeak}
        onPhraseLongPress={() => setContextMenuVisible(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F0',
  },
  closeButton: {
    position: 'absolute',
    top: 54,
    right: LAYOUT.screenPadding,
    zIndex: 10,
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
});
