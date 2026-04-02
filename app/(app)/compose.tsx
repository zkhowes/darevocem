import React, { useEffect, useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SectionLayout } from '../../components/sections/SectionLayout';
import { IntentSection } from '../../components/sections/IntentSection';
import { ComposeSection } from '../../components/sections/ComposeSection';
import { PhraseComposeSection } from '../../components/sections/PhraseComposeSection';
import { ContextMenu } from '../../components/shared/ContextMenu';
import { ComposeInputOverlay } from '../../components/shared/ComposeInputOverlay';
import type { InputMode } from '../../components/shared/ComposeInputOverlay';
import { PredictionDebug, logPredictionDebug } from '../../components/shared/PredictionDebug';
import { useFocusStore } from '../../stores/focus';
import { useCompositionStore } from '../../stores/composition';
import { getTimeOfDay } from '../../services/context';
import { getPredictions, getCommonPhrases } from '../../services/predictions';
import { speakPhrase } from '../../services/tts';
import { startRecording, stopRecording, cleanupRecording } from '../../services/recording';
import { transcribeAudio } from '../../services/transcription';
import { takePhoto, identifyImage } from '../../services/camera';
import { supabase } from '../../services/supabase';
import { usePreferencesStore } from '../../stores/preferences';
import { useLiveSpeech } from '../../hooks/useLiveSpeech';
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
  const [contextMenuVisible, setContextMenuVisible] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState<string | null>(null);

  // Compose section input mode (mic/keyboard/camera from context menu)
  const [composeInputMode, setComposeInputMode] = useState<InputMode>(null);
  const [composeInputProcessing, setComposeInputProcessing] = useState(false);

  // Live speech for compose-level mic (listens for next word, not intent)
  const {
    isListening: composeIsListening,
    transcript: composeTranscript,
    finalTranscript: composeFinalTranscript,
    startListening: composeStartListening,
    stopListening: composeStopListening,
  } = useLiveSpeech();

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
    const focusIndex = useFocusStore.getState().composeIndex;

    // Check if we have cached alternatives for this position from a previous refine
    if (state.refinementQueue.length > 0 && state.refinementQueueIndex === focusIndex) {
      const [next, ...rest] = state.refinementQueue;
      state.recordTriedItem(item.text);
      state.refine(focusIndex, next, rest);
      return;
    }

    // Only record the focused item as tried — not the entire prediction list
    state.recordTriedItem(item.text);

    state.setLoading(true);
    try {
      const currentState = useCompositionStore.getState();
      const fullPhrase = [currentState.intent, ...currentState.slots].filter(Boolean).join(' ');
      const otherOptions = currentState.predictions
        .filter((p) => p.text !== item.text)
        .map((p) => p.text);

      const { data, error } = await supabase.functions.invoke('predict', {
        body: {
          fullPhrase,
          targetItem: item.text,
          otherVisibleOptions: otherOptions,
          triedItems: currentState.triedItems,
          requestType: 'refine',
        },
      });

      if (__DEV__) {
        console.log('[REFINE] invoke result:', { data: JSON.stringify(data)?.slice(0, 200), error: error?.message ?? error });
      }

      const items = (data?.predictions ?? []).map((p: { text: string; wordType?: string }, i: number) => ({
        id: `refine-${i}-${Date.now()}`,
        text: p.text,
        itemType: 'prediction' as const,
        rank: i,
        ...(p.wordType ? { wordType: p.wordType as import('../../types').WordType } : {}),
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
          error: error?.message ?? data?.claudeError ?? (data?.error ? String(data.error) : undefined),
        });
      }

      if (items.length > 0) {
        // Swap only the focused item; cache remaining alternatives for next swipe-left
        const [replacement, ...queue] = items;
        useCompositionStore.getState().refine(focusIndex, replacement, queue);
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

  // Re-fetch predictions when intent changes (modifier applied, cycle, etc.)
  const handleIntentChanged = useCallback(async () => {
    // Read state AFTER the caller has updated it (Zustand updates are sync)
    const state = useCompositionStore.getState();
    const fullPhrase = [state.intent, ...state.slots].filter(Boolean).join(' ');

    if (__DEV__) {
      console.log('[INTENT CHANGED] re-fetching predictions for:', fullPhrase);
    }

    state.setLoading(true);
    try {
      const items = await getPredictions(fullPhrase, getTimeOfDay());

      if (__DEV__) {
        console.log('[INTENT CHANGED] got', items.length, 'predictions');
      }

      useCompositionStore.getState().setPredictions(items);
      // Reset focus to first item after new predictions load
      useFocusStore.getState().setComposeIndex(0);
    } finally {
      useCompositionStore.getState().setLoading(false);
    }
  }, []);

  // Refresh button: force re-fetch predictions for the current phrase state
  const handleRefresh = useCallback(async () => {
    const state = useCompositionStore.getState();
    state.clearModifier();
    state.setLoading(true);
    try {
      const fullPhrase = [state.intent, ...state.slots].filter(Boolean).join(' ');
      const items = await getPredictions(fullPhrase, getTimeOfDay());
      useCompositionStore.getState().setPredictions(items);
    } finally {
      useCompositionStore.getState().setLoading(false);
    }
  }, []);

  // Double-tap: select the focused word, add it to the phrase, fetch next predictions.
  // Uses advance() to push prediction history so phrase-bar undo restores predictions.
  const handleSelect = useCallback(async (item: ComposeItem) => {
    const state = useCompositionStore.getState();
    const selectedText = state.modifierState?.targetItem === item.text
      ? state.getModifierDisplayText() ?? (item.value ?? item.text)
      : (item.value ?? item.text);

    state.clearModifier();
    // Clear tried items and voice descriptors — new word means fresh prediction space
    state.clearTriedItems();
    state.clearVoiceDescriptors();
    state.setLoading(true);
    try {
      const freshState = useCompositionStore.getState();
      const fullPhrase = [freshState.intent, ...freshState.slots, selectedText].filter(Boolean).join(' ');
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

      // advance() pushes current predictions to history AND adds the slot,
      // so phrase-bar swipe-right (undoSlot -> backtrack) restores them.
      useCompositionStore.getState().advance(selectedText, nextPredictions);
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

  // Double-tap on phrase bar: speak the composed phrase (cloned voice with fallback)
  const handlePhraseSpeak = useCallback(async () => {
    const phrase = useCompositionStore.getState().getPhrase();
    if (!phrase) return;
    const useSystemTtsOnly = usePreferencesStore.getState().useSystemTtsOnly;
    await speakPhrase(phrase, {
      useSystemTtsOnly,
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

  // Clean up recording on unmount
  useEffect(() => {
    return () => { cleanupRecording(); };
  }, []);

  // Mic button on intent section: record voice descriptor for prediction reranking
  const handleMicPress = useCallback(async () => {
    if (isMicActive) {
      // Stop recording manually
      const uri = await stopRecording();
      setIsMicActive(false);
      if (uri) await processVoiceDescriptor(uri);
      return;
    }

    // Clear previous transcript — new recording starting
    setVoiceTranscript(null);
    setIsMicActive(true);
    await startRecording({
      onSilenceStop: async (uri) => {
        setIsMicActive(false);
        await processVoiceDescriptor(uri);
      },
      onMaxDuration: async (uri) => {
        setIsMicActive(false);
        await processVoiceDescriptor(uri);
      },
      onError: (error) => {
        setIsMicActive(false);
        if (__DEV__) {
          console.error('[compose] Mic recording error:', error.message);
        }
      },
    });
  }, [isMicActive]);

  // Process voice descriptor: transcribe → extract intent or descriptors → update predictions
  const processVoiceDescriptor = useCallback(async (fileUri: string) => {
    const state = useCompositionStore.getState();
    state.setLoading(true);

    try {
      const result = await transcribeAudio(fileUri);

      if (__DEV__) {
        console.log('[compose] Voice descriptor result:', JSON.stringify(result));
      }

      // Show what was heard — replaces "mic" label in IntentSection
      if (result.rawTranscript) {
        setVoiceTranscript(result.rawTranscript);
      }

      // If an intent was extracted ("I need", "Can I", etc.), load it as the active intent
      // and re-fetch predictions from scratch for the new intent.
      if (result.intent) {
        useCompositionStore.getState().setIntent(result.intent);
        useCompositionStore.getState().clearTriedItems();

        const fullPhrase = [result.intent, ...useCompositionStore.getState().slots].filter(Boolean).join(' ');
        const items = await getPredictions(fullPhrase, getTimeOfDay());

        if (__DEV__) {
          logPredictionDebug({
            timestamp: Date.now(),
            action: `VOICE INTENT "${result.intent}"`,
            fullPhrase,
            triedItems: [],
            predictions: items.map((p) => p.text),
            source: items.length > 0 ? 'claude' : 'fallback',
          });
        }

        if (items.length > 0) {
          useCompositionStore.getState().setPredictions(items);
          useFocusStore.getState().setComposeIndex(0);
        }
        return;
      }

      // No intent — fall back to voice_hint reranking with descriptors
      const descriptors = result.descriptors;
      if (descriptors.length === 0 && result.rawTranscript) {
        descriptors.push(result.rawTranscript);
      }

      if (descriptors.length === 0) {
        useCompositionStore.getState().setLoading(false);
        return;
      }

      useCompositionStore.getState().setVoiceDescriptors(descriptors);

      const freshState = useCompositionStore.getState();
      const fullPhrase = [freshState.intent, ...freshState.slots].filter(Boolean).join(' ');
      const currentPredictions = freshState.predictions.map((p) => p.text);

      const { data, error } = await supabase.functions.invoke('predict', {
        body: {
          requestType: 'voice_hint',
          fullPhrase,
          voiceDescriptor: descriptors.join(', '),
          currentPredictions,
        },
      });

      if (__DEV__) {
        logPredictionDebug({
          timestamp: Date.now(),
          action: `VOICE HINT "${descriptors.join(', ')}"`,
          fullPhrase,
          triedItems: [],
          predictions: (data?.predictions ?? []).map((p: { text: string }) => p.text),
          latencyMs: data?.debug?.latencyMs,
          source: (data?.predictions?.length ?? 0) > 0 ? 'claude' : 'empty',
          error: error?.message ?? data?.claudeError,
        });
      }

      const items: ComposeItem[] = (data?.predictions ?? []).map(
        (p: { text: string; wordType?: string }, i: number) => ({
          id: `voice-hint-${i}-${Date.now()}`,
          text: p.text,
          itemType: 'prediction' as const,
          rank: i,
          ...(p.wordType ? { wordType: p.wordType as import('../../types').WordType } : {}),
        }),
      );

      if (items.length > 0) {
        useCompositionStore.getState().setPredictions(items);
        useFocusStore.getState().setComposeIndex(0);
      }
    } finally {
      useCompositionStore.getState().setLoading(false);
    }
  }, []);

  // === Compose Input Handlers (mic/keyboard/camera from context menu) ===

  // Insert a word as the top prediction item so it integrates with normal swipe flow
  const insertAsTopPrediction = useCallback((word: string) => {
    const store = useCompositionStore.getState();
    const newItem: ComposeItem = {
      id: generateId(),
      text: word,
      itemType: 'prediction',
      rank: 0,
    };
    // Prepend to existing predictions, bump their ranks
    const updated = [newItem, ...store.predictions.map((p, i) => ({ ...p, rank: i + 1 }))];
    store.setPredictions(updated);
    useFocusStore.getState().setComposeIndex(0);
    setComposeInputMode(null);
    setComposeInputProcessing(false);
  }, []);

  // Compose mic: start listening for a word
  const handleComposeMicStart = useCallback(async () => {
    setComposeInputMode('mic');
    await composeStartListening();
  }, [composeStartListening]);

  // Compose mic: stop and wait for final transcript
  const handleComposeMicStop = useCallback(() => {
    composeStopListening();
  }, [composeStopListening]);

  // When compose mic finishes, extract the word and insert it
  useEffect(() => {
    if (!composeFinalTranscript || composeIsListening) return;
    if (composeInputMode !== 'mic') return;

    const word = composeFinalTranscript.trim();
    if (word.length < 1) {
      setComposeInputMode(null);
      return;
    }

    // Use just the last 1-2 words (user is saying a next word, not a sentence)
    const words = word.split(/\s+/);
    const nextWord = words.length <= 2 ? word : words.slice(-2).join(' ');
    insertAsTopPrediction(nextWord);
  }, [composeFinalTranscript, composeIsListening, composeInputMode, insertAsTopPrediction]);

  // Compose keyboard: insert typed word
  const handleComposeKeyboardSubmit = useCallback((text: string) => {
    insertAsTopPrediction(text);
  }, [insertAsTopPrediction]);

  // Compose camera: take photo, identify, insert result
  const handleComposeCameraStart = useCallback(async () => {
    setComposeInputMode('camera');
    setComposeInputProcessing(true);
    try {
      const uri = await takePhoto();
      if (!uri) {
        // User cancelled
        setComposeInputMode(null);
        setComposeInputProcessing(false);
        return;
      }

      const word = await identifyImage(uri);
      insertAsTopPrediction(word);
    } catch (err) {
      if (__DEV__) {
        console.error('[compose] Camera/identify error:', (err as Error).message);
      }
      setComposeInputMode(null);
      setComposeInputProcessing(false);
    }
  }, [insertAsTopPrediction]);

  // Dismiss compose input overlay
  const handleComposeInputDismiss = useCallback(() => {
    if (composeIsListening) {
      composeStopListening();
    }
    setComposeInputMode(null);
    setComposeInputProcessing(false);
  }, [composeIsListening, composeStopListening]);

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
          setContextMenuVisible(false);
          setComposeInputMode('keyboard');
        }}
        onMic={() => {
          setContextMenuVisible(false);
          handleComposeMicStart();
        }}
        onCamera={() => {
          setContextMenuVisible(false);
          handleComposeCameraStart();
        }}
        onSave={handlePhraseSave}
      />

      <SectionLayout
        headerContent={
          <IntentSection
            onNavigateHome={handleNavigateHome}
            timeOfDay={getTimeOfDay()}
            initialIntent={intent ?? undefined}
            onIntentChanged={handleIntentChanged}
            onMicPress={composeMode === 'predict' ? handleMicPress : undefined}
            isMicActive={isMicActive}
            voiceTranscript={voiceTranscript}
            onContextAction={(action) => {
              if (action === 'record') {
                handleMicPress();
              } else if (action === 'type') {
                setContextMenuVisible(true);
              }
            }}
          />
        }
        itemsContent={
          composeInputMode ? (
            <ComposeInputOverlay
              mode={composeInputMode}
              isListening={composeIsListening}
              transcript={composeTranscript}
              isProcessing={composeInputProcessing}
              onMicStop={handleComposeMicStop}
              onKeyboardSubmit={handleComposeKeyboardSubmit}
              onDismiss={handleComposeInputDismiss}
            />
          ) : composeMode === 'predict' ? (
            <ComposeSection
              onAdvance={handleAdvance}
              onBacktrack={handleBacktrack}
              onModifierTap={handleModifierTap}
              onSelect={handleSelect}
              onLongPress={() => setContextMenuVisible(true)}
              onRefresh={handleRefresh}
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
