import React, { useEffect, useCallback, useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SectionLayout } from '../../components/sections/SectionLayout';
import { IntentSection } from '../../components/sections/IntentSection';
import { ComposeSection } from '../../components/sections/ComposeSection';
import { useFocusStore } from '../../stores/focus';
import { useCompositionStore } from '../../stores/composition';
import { getTimeOfDay } from '../../services/context';
import { getPredictions, getModifiers } from '../../services/predictions';
import { speakPhrase } from '../../services/tts';
import { FALLBACK_MODIFIERS } from '../../constants/fallbacks';
import type { ComposeItem } from '../../types';

export default function ComposeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string; value?: string; intent?: string }>();
  const focusReset = useFocusStore((s) => s.reset);
  const setSection = useFocusStore((s) => s.setSection);
  const intent = useCompositionStore((s) => s.intent);
  const slots = useCompositionStore((s) => s.slots);
  const [intentCollapsed, setIntentCollapsed] = useState(true);

  // Conditional mount: skip reset if pre-loaded state exists
  useEffect(() => {
    const { intent: currentIntent, predictions, slots } = useCompositionStore.getState();
    if (currentIntent || predictions.length > 0 || slots.length > 0) {
      // Pre-loaded from home or saved screen — don't reset
      focusReset();

      // For saved phrases, fetch predictions so user can continue composing
      if (params.type === 'saved' && slots.length > 0 && predictions.length === 0) {
        setSection('compose', 0);
        const store = useCompositionStore.getState();
        store.setLoading(true);
        getPredictions('', slots, 'object', getTimeOfDay(), [], [])
          .then((items) => useCompositionStore.getState().setPredictions(items))
          .finally(() => useCompositionStore.getState().setLoading(false));
      }
      return;
    }
    // Direct navigation (deep link) — full reset
    useCompositionStore.getState().reset();
    focusReset();
  }, []);

  // Fetch predictions when intent changes and no predictions are pre-loaded
  useEffect(() => {
    if (!intent) return;
    const { predictions, isLoading } = useCompositionStore.getState();
    // Skip if predictions already loaded (pre-fetch from home)
    if (predictions.length > 0 && !isLoading) return;

    const { setPredictions, setLoading, triedPaths } = useCompositionStore.getState();
    let cancelled = false;

    async function fetchPredictions() {
      setLoading(true);
      try {
        const items = await getPredictions(
          intent!,
          slots,
          'object',
          getTimeOfDay(),
          [],
          [],
          triedPaths,
        );
        if (!cancelled) setPredictions(items);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchPredictions();
    return () => { cancelled = true; };
  }, [intent, slots.length]);

  const handleNavigateHome = useCallback(() => {
    router.back();
  }, []);

  // Right swipe: advance down prediction path
  const handleAdvance = useCallback(async (item: ComposeItem) => {
    const state = useCompositionStore.getState();
    const selectedText = item.value ?? item.text;

    // Fetch next predictions for the continued path
    const nextPredictions = await getPredictions(
      state.intent ?? '',
      [...state.slots, selectedText],
      'object',
      getTimeOfDay(),
      [],
      [],
    );

    useCompositionStore.getState().advance(selectedText, nextPredictions);
  }, []);

  // Left swipe: backtrack or diverge
  const handleBacktrack = useCallback(() => {
    useCompositionStore.getState().backtrack();
  }, []);

  const handleDiverge = useCallback(async () => {
    const state = useCompositionStore.getState();
    // Record current path as tried
    const currentPath = [state.intent ?? '', ...state.slots];
    state.recordTriedPath(currentPath);

    // Re-read state after recordTriedPath to get the freshly recorded path
    const freshState = useCompositionStore.getState();
    freshState.setLoading(true);
    try {
      const items = await getPredictions(
        freshState.intent ?? '',
        freshState.slots,
        'object',
        getTimeOfDay(),
        [],
        [],
        freshState.triedPaths,
      );
      useCompositionStore.getState().setPredictions(items);
    } finally {
      useCompositionStore.getState().setLoading(false);
    }
  }, []);

  // Single tap: cycle modifiers on focused item
  const handleModifierTap = useCallback(async (item: ComposeItem) => {
    const state = useCompositionStore.getState();
    if (state.modifierState && state.modifierState.targetItem === item.text) {
      state.cycleModifier();
    } else {
      try {
        const modifiers = await getModifiers(
          state.intent ?? '',
          state.slots,
          item.text,
        );
        state.setModifiers(item.text, modifiers.length > 0 ? modifiers : FALLBACK_MODIFIERS);
      } catch {
        state.setModifiers(item.text, FALLBACK_MODIFIERS);
      }
    }
  }, []);

  // Double-tap selection: add to phrase then fetch next predictions
  const handleSelect = useCallback(async (selectedText: string) => {
    const state = useCompositionStore.getState();
    state.setLoading(true);
    try {
      const nextPredictions = await getPredictions(
        state.intent ?? '',
        state.slots, // slots already updated by addSlot in ComposeSection
        'object',
        getTimeOfDay(),
        [],
        [],
      );
      useCompositionStore.getState().setPredictions(nextPredictions);
    } finally {
      useCompositionStore.getState().setLoading(false);
    }
  }, []);

  // Double-tap on phrase bar: speak the composed phrase, then go home
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
    // Task 13: save to saved_phrases
  }, []);

  const handlePhraseNavigateUp = useCallback(() => {
    setSection('compose');
  }, []);

  return (
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
        <ComposeSection
          onAdvance={handleAdvance}
          onBacktrack={handleBacktrack}
          onDiverge={handleDiverge}
          onModifierTap={handleModifierTap}
          onSelect={handleSelect}
        />
      }
      onPhraseSave={handlePhraseSave}
      onPhraseNavigateUp={handlePhraseNavigateUp}
      onPhraseSpeak={handlePhraseSpeak}
    />
  );
}
