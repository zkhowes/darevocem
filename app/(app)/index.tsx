import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ScrollView,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ErrorBoundary } from '../../components/shared/ErrorBoundary';
import { MicDebugOverlay } from '../../components/shared/MicDebugOverlay';
import { HandwritingOverlay } from '../../components/shared/HandwritingOverlay';
import { InputCarousel, type CarouselItem } from '../../components/shared/InputCarousel';
import { TipCard } from '../../components/home/TipCard';
import { HOME_TIPS, type Tip } from '../../constants/tips';
import { stopSpeaking } from '../../services/tts';
import { useCompositionStore } from '../../stores/composition';
import { getTimeOfDay } from '../../services/context';
import { getPredictions, getCommonPhrases } from '../../services/predictions';
import { fireContextualSuggestionForHome } from '../../services/contextualSuggestions';
import { mergeCommonPhrase } from '../../utils/predictionMerge';
import { prefetchPredictions, getOrFetchPredictions, getCachedPredictions } from '../../services/predictionCache';
import { useLiveSpeech } from '../../hooks/useLiveSpeech';
import { takePhoto, identifyImage } from '../../services/camera';
import { generateId } from '../../types';
import { INTENTS, DEFAULT_INTENT_BY_TIME } from '../../constants/intents';
import { openIntent } from '../../utils/openIntent';
import { LAYOUT } from '../../constants/config';
import { supabase } from '../../services/supabase';
import type { TranscriptionResult, ComposeItem, SavedPhrase } from '../../types';

// Counter persisted across launches so each app load shows a different tip,
// cycling through HOME_TIPS (plus the profile intro phrase slot).
const TIP_ROTATION_KEY = 'darevocem_tip_rotation_index';

// Max prediction cards shown on home (3 normally, 4 if speech/keyboard produced P0)
const MAX_PREDICTIONS = 3;

// Input carousel items. Order matters: mic at index 0 is the default focus on
// every screen mount. Ionicons glyphs — self-descriptive, so no text label is
// rendered (label is accessibility-only). Vector icons render consistently
// across simulator/device, unlike the emoji we previously avoided.
const CAROUSEL_ITEMS: CarouselItem[] = [
  { id: 'mic', icon: 'mic', label: 'Speak' },
  { id: 'pen', icon: 'pencil', label: 'Write by hand' },
  { id: 'abc', icon: 'text', label: 'Type' },
  { id: 'cam', icon: 'camera', label: 'Identify with camera' },
];

declare const __DEV__: boolean;

export default function HomeScreen() {
  const router = useRouter();
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [keyboardText, setKeyboardText] = useState('');
  const keyboardRef = useRef<TextInput>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // The rotating home tip shown this launch. `hint` is optional (used for the
  // intro-phrase slot). null once dismissed or when navigating away.
  const [tip, setTip] = useState<(Tip & { hint?: string }) | null>(null);
  const [showHandwriting, setShowHandwriting] = useState(false);

  // Input carousel — default focus is mic (idx 0). Resets on every mount.
  const [focusedInputIndex, setFocusedInputIndex] = useState(0);

  // Common & Saved phrases for home screen sections
  const [commonPhrases, setCommonPhrases] = useState<ComposeItem[]>([]);
  const [savedPhrases, setSavedPhrases] = useState<SavedPhrase[]>([]);

  // Speech recognition state — real-time on-device transcript
  const {
    isListening,
    transcript,
    finalTranscript,
    volume,
    error: speechError,
    durationMs,
    startListening,
    stopListening,
    debugLog,
  } = useLiveSpeech();

  // Post-processing state (Gemini intent extraction)
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedIntent, setExtractedIntent] = useState<TranscriptionResult | null>(null);

  // Camera-from-home processing state (disables the camera flank while in flight)
  const [isCameraProcessing, setIsCameraProcessing] = useState(false);

  // Prediction cards — curated intents, reordered by time-of-day, capped at 3
  const predictionCards = useMemo(() => {
    const timeOfDay = getTimeOfDay();
    const defaultIdx = DEFAULT_INTENT_BY_TIME[timeOfDay] ?? 0;
    const cards = INTENTS.map((intent, i) => ({
      id: `intent-${i}`,
      text: intent.text,
      addsToPhrase: intent.addsToPhrase,
    }));
    if (defaultIdx > 0 && defaultIdx < cards.length) {
      const [defaultCard] = cards.splice(defaultIdx, 1);
      cards.unshift(defaultCard);
    }
    return cards.slice(0, MAX_PREDICTIONS);
  }, []);

  // Load common phrases (time-of-day based) and saved phrases on mount.
  // Also warm the prediction cache for the 3 visible intent cards — by the
  // time the user taps one, predictions are usually already cached.
  useEffect(() => {
    const timeOfDay = getTimeOfDay();
    getCommonPhrases(timeOfDay)
      .then((items) => {
        setCommonPhrases(items.slice(0, 3));
      })
      .catch((err) => {
        // getCommonPhrases already falls back to curated phrases internally,
        // but guard the .then chain so an unexpected throw never leaves the
        // Common section silently empty.
        if (__DEV__) console.log('[home] common phrases load failed:', err);
      });

    supabase
      .from('saved_phrases')
      .select('*')
      .ilike('category', 'personal')
      .order('sort_order')
      .limit(3)
      .then(({ data }) => {
        if (data) setSavedPhrases(data);
      });

    // Warm cache for visible prediction cards (fire-and-forget).
    for (const card of predictionCards) {
      prefetchPredictions(card.text, timeOfDay);
    }
  }, [predictionCards]);

  // Rotating tip — a different one each app load. The rotation cycles through
  // HOME_TIPS plus one extra "slot" for the user's profile-derived aphasia
  // introduction phrase (so it still resurfaces periodically). The user finds
  // reading hard, so TipCard has a speak icon (system voice).
  useEffect(() => {
    let cancelled = false;

    async function pickTip() {
      const raw = await AsyncStorage.getItem(TIP_ROTATION_KEY);
      const index = raw ? parseInt(raw, 10) || 0 : 0;
      // Advance the counter for next launch.
      AsyncStorage.setItem(TIP_ROTATION_KEY, String(index + 1));

      // The rotation space is HOME_TIPS + 1 (the intro-phrase slot at the end).
      const slotCount = HOME_TIPS.length + 1;
      const slot = index % slotCount;

      if (slot < HOME_TIPS.length) {
        if (!cancelled) setTip(HOME_TIPS[slot]);
        return;
      }

      // Intro-phrase slot: pull the user's aphasia introduction from their
      // saved phrases. If there isn't one (blank profile / not seeded), fall
      // back to the first how-to tip so the card is never empty.
      const { data } = await supabase
        .from('saved_phrases')
        .select('text')
        .ilike('category', 'personal')
        .ilike('text', '%aphasia%')
        .limit(1);

      if (cancelled) return;
      if (data && data.length > 0) {
        setTip({
          title: 'Your introduction',
          body: data[0].text,
          hint: 'Find this anytime in Saved',
        });
      } else {
        setTip(HOME_TIPS[0]);
      }
    }

    pickTip();
    return () => { cancelled = true; };
  }, []);

  const dismissTip = useCallback(() => {
    setTip(null);
  }, []);

  // Dismiss the tip when the user leaves home (e.g. into compose). The card is
  // a momentary greeting, not persistent chrome — it shouldn't linger behind
  // navigation and reappear on back. useFocusEffect's cleanup fires on blur
  // even though expo-router keeps the screen mounted in the stack. Also stop
  // any in-progress read-aloud so it doesn't keep talking after navigation.
  useFocusEffect(
    useCallback(() => {
      return () => {
        setTip(null);
        stopSpeaking();
      };
    }, []),
  );

  // Mic button: tap to start/stop
  const handleMicTap = useCallback(async () => {
    if (isListening) {
      stopListening();
      return;
    }

    // Clear previous results
    setExtractedIntent(null);
    await startListening();
  }, [isListening, startListening, stopListening]);

  // Merge a contextual common-phrase suggestion into the home Common section.
  // Pure merge logic in utils/predictionMerge.ts so it'\''s testable.
  const mergeContextualSuggestion = useCallback((item: ComposeItem) => {
    setCommonPhrases((current) => mergeCommonPhrase(current, item));
  }, []);

  // When speech recognition ends with a final transcript, send to Gemini for intent extraction
  useEffect(() => {
    if (!finalTranscript || isListening) return;

    // Only process if we got something meaningful
    if (finalTranscript.trim().length < 2) return;

    setIsProcessing(true);

    // We don't have an audio file from speech recognition, so we send the
    // transcript text directly. We'll enhance transcription.ts to accept text too.
    // For now, extract intent client-side from the transcript.
    const words = finalTranscript.trim().split(/\s+/);
    // Simple intent extraction: check if transcript starts with a known intent
    const lowerTranscript = finalTranscript.toLowerCase().trim();
    let matchedIntent: string | null = null;
    for (const intent of INTENTS) {
      if (lowerTranscript.startsWith(intent.text.toLowerCase())) {
        matchedIntent = intent.text;
        break;
      }
    }

    // If no known intent matched, use the first 2-3 words as the intent
    if (!matchedIntent && words.length >= 2) {
      matchedIntent = words.slice(0, Math.min(3, words.length)).join(' ');
    } else if (!matchedIntent) {
      matchedIntent = finalTranscript.trim();
    }

    setExtractedIntent({
      intent: matchedIntent,
      descriptors: [],
      confidence: 'medium',
      rawTranscript: finalTranscript,
    });
    setIsProcessing(false);
    // Fire the contextual common-phrase suggestion NOW (while the user is
    // still on home reviewing the P0 card), not on tap (when they'd navigate
    // away before the suggestion resolved).
    fireContextualSuggestionForHome(matchedIntent, mergeContextualSuggestion);
    // Speculative prefetch — compose will need predictions for this intent
    // when the user taps. Kicking off now means the navigation lands on a
    // warm cache (~instant) instead of cold (~1.5s Claude roundtrip).
    prefetchPredictions(matchedIntent, getTimeOfDay());
  }, [finalTranscript, isListening, mergeContextualSuggestion]);

  // Navigate to compose with a prediction card. Shared with the Predicted L2
  // screen via openIntent so selection behaves identically in both.
  const handleCardTap = useCallback(
    (intentText: string) => openIntent(router, intentText),
    [router],
  );

  // Navigate to compose with the extracted speech intent
  const handleSpeechIntentTap = useCallback(() => {
    if (!extractedIntent?.intent) return;

    const intent = extractedIntent.intent;
    const store = useCompositionStore.getState();
    const timeOfDay = getTimeOfDay();

    const cached = getCachedPredictions(intent, []);
    store.preload(intent, cached ?? []);
    if (extractedIntent.descriptors.length > 0) {
      store.setVoiceDescriptors(extractedIntent.descriptors);
    }
    store.setLoading(!cached);

    if (!cached) {
      getOrFetchPredictions(intent, timeOfDay).then(({ predictions }) => {
        const s = useCompositionStore.getState();
        s.setPredictions(predictions);
        s.setLoading(false);
      });
    }

    setExtractedIntent(null);
    router.push({ pathname: '/(app)/compose', params: { type: 'prediction', value: intent } } as never);
  }, [extractedIntent, router]);

  // Keyboard submit: don't navigate. Land the typed text as a P0 candidate
  // card on home (same slot mic uses), fire the contextual common-phrase
  // suggestion, let the user review and tap to advance.
  const handleKeyboardSubmit = useCallback(() => {
    const text = keyboardText.trim();
    if (!text) return;
    setExtractedIntent({
      intent: text,
      descriptors: [],
      confidence: 'high',
      rawTranscript: text,
    });
    setKeyboardText('');
    setShowKeyboard(false);
    fireContextualSuggestionForHome(text, mergeContextualSuggestion);
    prefetchPredictions(text, getTimeOfDay());
  }, [keyboardText, mergeContextualSuggestion]);

  // Handwriting accept (letter or drawing mode). Same pattern: land as P0,
  // fire suggestion, don't navigate. User taps the card when they're ready.
  const handleHandwritingAccept = useCallback((word: string) => {
    setShowHandwriting(false);
    if (!word || word.trim().length === 0) return;
    const text = word.trim();
    setExtractedIntent({
      intent: text,
      descriptors: [],
      confidence: 'high',
      rawTranscript: text,
    });
    fireContextualSuggestionForHome(text, mergeContextualSuggestion);
    prefetchPredictions(text, getTimeOfDay());
  }, [mergeContextualSuggestion]);

  // Home camera tap: take a photo, identify it, land the literal name as a
  // P0 candidate card on home. Same non-navigating pattern as mic/keyboard/
  // handwriting. The contextual interpretation is fired through the common-
  // phrase suggestion hook so we don't double-surface the same concept.
  const handleHomeCameraTap = useCallback(async () => {
    if (isCameraProcessing) return;
    setIsCameraProcessing(true);
    try {
      const uri = await takePhoto();
      if (!uri) {
        setIsCameraProcessing(false);
        return;
      }

      const result = await identifyImage(uri);
      const literal = result.literal?.trim();
      if (!literal) {
        setIsCameraProcessing(false);
        return;
      }

      setExtractedIntent({
        intent: literal,
        descriptors: [],
        confidence: 'high',
        rawTranscript: literal,
      });
      setIsCameraProcessing(false);
      prefetchPredictions(literal, getTimeOfDay());
      // Camera already produced a contextual interpretation; route it through
      // the home Common merger so it shows alongside the captured P0.
      if (result.contextual && result.contextual.toLowerCase() !== literal.toLowerCase()) {
        mergeContextualSuggestion({
          id: generateId(),
          text: result.contextual,
          itemType: 'common',
          rank: 0,
        });
      }
    } catch (err) {
      setIsCameraProcessing(false);
      const name = (err as Error)?.name;
      const signedOut = name === 'NotSignedInError';
      const permissionDenied = name === 'CameraPermissionDeniedError';
      const msg = (err as Error).message ?? 'Camera error';
      if (__DEV__) console.error('[home] Camera error:', msg);
      const { Alert, Linking } = require('react-native');
      if (signedOut) {
        Alert.alert('Please sign in again', 'Your session expired. Sign in again to use the camera.');
      } else if (permissionDenied) {
        Alert.alert(
          'Camera access needed',
          'Turn on camera access for Dare Vocem in Settings to add things you see to your sentences.',
          [
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
            { text: 'Cancel', style: 'cancel' },
          ],
        );
      } else {
        Alert.alert('Camera unavailable', msg);
      }
    }
  }, [isCameraProcessing, mergeContextualSuggestion]);

  // Dispatcher for InputCarousel taps. The carousel just tells us which item
  // was activated; we run the matching handler. Mic toggles record/stop;
  // others open their respective overlays/flows.
  const handleCarouselActivate = useCallback((item: CarouselItem) => {
    switch (item.id) {
      case 'mic':
        handleMicTap();
        return;
      case 'pen':
        setShowHandwriting(true);
        return;
      case 'abc':
        setShowKeyboard(true);
        return;
      case 'cam':
        handleHomeCameraTap();
        return;
    }
  }, [handleMicTap, handleHomeCameraTap]);

  // Navigate to compose with a common phrase
  const handleCommonTap = useCallback(
    (phrase: ComposeItem) => {
      const store = useCompositionStore.getState();
      store.preloadPhraseMode(phrase.text, 'common');
      router.push({ pathname: '/(app)/compose', params: { type: 'common', value: phrase.text } } as never);
    },
    [router],
  );

  // Navigate to compose with a saved phrase
  const handleSavedTap = useCallback(
    (phrase: SavedPhrase) => {
      const textToAdd = phrase.value ?? phrase.text;
      const store = useCompositionStore.getState();
      store.preloadSavedPhrase(textToAdd);
      router.push({ pathname: '/(app)/compose', params: { type: 'saved', value: textToAdd } } as never);
    },
    [router],
  );

  // Normalize volume for visual display (-2 to 10 range from expo-speech-recognition)
  // <0 = inaudible, map to 0-1
  const normalizedVolume = Math.max(0, Math.min(1, (volume + 2) / 12));

  return (
    <ErrorBoundary>
      <SafeAreaView style={styles.container}>
        {/* Nav bar */}
        <View style={styles.nav}>
          <Pressable onPress={() => setMenuOpen((v) => !v)} hitSlop={12}>
            <Text style={styles.navIcon}>{'\u2630'}</Text>
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

        {/* Rotating tip — different each launch, dismissible, speak icon for
            read-aloud. Cleared on dismiss or when navigating away. */}
        {tip && (
          <TipCard
            title={tip.title}
            body={tip.body}
            hint={tip.hint}
            onDismiss={dismissTip}
          />
        )}

        {/* === Input Carousel — swipe to focus, tap to activate ===
            Replaces the previous mic-hero + alt-input-row block. Mic is the
            default focus (idx 0); swipe to pen / abc / cam. Volume bar still
            appears below the carousel while recording. */}
        <InputCarousel
          items={CAROUSEL_ITEMS}
          focusedIndex={focusedInputIndex}
          onFocusChange={setFocusedInputIndex}
          onActivate={handleCarouselActivate}
          isRecording={isListening}
          belowSlot={
            isListening ? (
              <View style={styles.volumeBarContainer}>
                <View style={styles.volumeBarTrack}>
                  <View
                    style={[
                      styles.volumeBarFill,
                      { width: `${normalizedVolume * 100}%` },
                    ]}
                  />
                </View>
              </View>
            ) : null
          }
        />

        {/* === Transcript Bubble — shows words as heard === */}
        {(isListening || transcript) && !extractedIntent && (
          <View style={styles.transcriptBubble}>
            {isListening && (
              <View style={styles.transcriptDotRow}>
                <View style={styles.liveDot} />
                <Text style={styles.transcriptLabel}>LISTENING</Text>
              </View>
            )}
            <Text style={styles.transcriptText}>
              {transcript || 'Speak now...'}
            </Text>
          </View>
        )}

        {/* === Processing indicator === */}
        {isProcessing && (
          <View style={styles.processingBubble}>
            <Text style={styles.processingText}>Processing...</Text>
          </View>
        )}

        {/* === Speech error === */}
        {speechError && !isListening && (
          <View style={styles.errorBubble}>
            <Text style={styles.errorText}>{speechError}</Text>
          </View>
        )}

        {/* Keyboard overlay */}
        {showKeyboard && (
          <View style={styles.keyboardCard}>
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
                autoFocus
              />
              {keyboardText.trim().length > 0 && (
                <Pressable style={styles.goButton} onPress={handleKeyboardSubmit}>
                  <Text style={styles.goButtonText}>Go</Text>
                </Pressable>
              )}
              <Pressable
                style={styles.keyboardClose}
                onPress={() => { setShowKeyboard(false); setKeyboardText(''); }}
              >
                <Text style={styles.keyboardCloseText}>X</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Handwriting canvas overlay */}
        <HandwritingOverlay
          visible={showHandwriting}
          onAccept={handleHandwritingAccept}
          onCancel={() => setShowHandwriting(false)}
        />

        {/* === Home Sections: Predicted, Common, Saved === */}
        <ScrollView
          style={styles.cardList}
          contentContainerStyle={styles.cardListContent}
          showsVerticalScrollIndicator={false}
        >
          {/* --- Predicted Section --- */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>PREDICTED</Text>
            <Pressable onPress={() => router.push('/(app)/predicted' as never)}>
              <Text style={styles.sectionMore}>See all</Text>
            </Pressable>
          </View>

          {/* P0: Speech-detected intent (when available) */}
          {extractedIntent?.intent && (
            <Pressable
              style={[styles.card, styles.cardSpeech]}
              onPress={handleSpeechIntentTap}
            >
              <Text style={styles.cardIndex}>P0</Text>
              <View style={styles.cardBody}>
                <Text style={styles.cardTextHighlighted}>
                  {extractedIntent.intent}
                </Text>
                {extractedIntent.rawTranscript !== extractedIntent.intent && (
                  <Text style={styles.cardRawTranscript}>
                    heard: &quot;{extractedIntent.rawTranscript}&quot;
                  </Text>
                )}
              </View>
              <Text style={styles.cardHint}>added</Text>
            </Pressable>
          )}

          {/* P1, P2, P3 — curated intent predictions (max 3) */}
          {predictionCards.map((card, i) => {
            const label = `P${extractedIntent ? i + 1 : i + 1}`;
            return (
              <Pressable
                key={card.id}
                style={[styles.card, styles.cardPrediction]}
                onPress={() => handleCardTap(card.text)}
              >
                <Text style={styles.cardIndex}>{label}</Text>
                <View style={styles.cardBody}>
                  <Text style={styles.cardText}>{card.text}</Text>
                </View>
              </Pressable>
            );
          })}

          {/* --- Common Section --- */}
          {commonPhrases.length > 0 && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionLabel}>COMMON</Text>
                <Pressable onPress={() => router.push('/(app)/common' as never)}>
                  <Text style={styles.sectionMore}>See all</Text>
                </Pressable>
              </View>
              {commonPhrases.map((phrase, i) => (
                <Pressable
                  key={phrase.id}
                  style={[styles.card, styles.cardCommon]}
                  onPress={() => handleCommonTap(phrase)}
                >
                  <Text style={styles.cardIndex}>C{i + 1}</Text>
                  <View style={styles.cardBody}>
                    <Text style={styles.cardText} numberOfLines={2}>{phrase.text}</Text>
                  </View>
                </Pressable>
              ))}
            </>
          )}

          {/* --- Saved Section --- */}
          {savedPhrases.length > 0 && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionLabel}>SAVED</Text>
                <Pressable onPress={() => router.push('/(app)/saved' as never)}>
                  <Text style={styles.sectionMore}>See all</Text>
                </Pressable>
              </View>
              {savedPhrases.map((phrase, i) => {
                const displayText = phrase.label
                  ? `${phrase.label}: ${phrase.value ?? phrase.text}`
                  : phrase.text;
                return (
                  <Pressable
                    key={phrase.id}
                    style={[styles.card, styles.cardSaved]}
                    onPress={() => handleSavedTap(phrase)}
                  >
                    <Text style={styles.cardIndex}>S{i + 1}</Text>
                    <View style={styles.cardBody}>
                      <Text style={styles.cardText} numberOfLines={2}>{displayText}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </>
          )}
        </ScrollView>

        {/* Mic Debug Overlay — dev only */}
        <MicDebugOverlay
          meteringDb={volume * 6} // rough conversion: volume(-2..10) to dB-like(-12..60)
          isListening={isListening}
          isRecording={isListening}
          transcript={transcript}
          error={speechError}
          durationMs={durationMs}
          log={debugLog}
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

  // --- Volume bar (rendered below the input carousel while mic is recording) ---
  volumeBarContainer: {
    marginTop: 12,
    width: 160,
  },
  volumeBarTrack: {
    height: 6,
    backgroundColor: '#E0E0E0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  volumeBarFill: {
    height: '100%',
    backgroundColor: '#E74C3C',
    borderRadius: 3,
  },

  // --- Transcript bubble ---
  transcriptBubble: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: LAYOUT.screenPadding,
    marginBottom: 12,
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#E74C3C',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  transcriptDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E74C3C',
  },
  transcriptLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#E74C3C',
    letterSpacing: 1,
  },
  transcriptText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1A1A1A',
    lineHeight: 28,
  },

  // --- Processing ---
  processingBubble: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: LAYOUT.screenPadding,
    marginBottom: 12,
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#F39C12',
  },
  processingText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#F39C12',
  },

  // --- Error ---
  errorBubble: {
    backgroundColor: '#FFF5F5',
    marginHorizontal: LAYOUT.screenPadding,
    marginBottom: 12,
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#E74C3C',
  },
  errorText: {
    fontSize: 14,
    color: '#E74C3C',
  },

  // --- Section headers ---
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#999',
    letterSpacing: 2,
    marginBottom: 6,
    marginTop: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 6,
  },
  sectionMore: {
    fontSize: 13,
    fontWeight: '600',
    color: '#E07B2E',
  },

  // --- Cards ---
  cardList: {
    flex: 1,
  },
  cardListContent: {
    paddingHorizontal: LAYOUT.screenPadding,
    paddingBottom: 40,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 6,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  cardPrediction: {
    borderLeftColor: '#E07B2E',
  },
  cardCommon: {
    borderLeftColor: '#2B7A78',
  },
  cardSaved: {
    borderLeftColor: '#7B68AE',
  },
  cardSpeech: {
    borderLeftColor: '#27AE60',
    backgroundColor: '#F5FFF7',
  },
  cardIndex: {
    fontSize: 14,
    fontWeight: '700',
    color: '#999',
    width: 32,
    fontVariant: ['tabular-nums'],
  },
  cardBody: {
    flex: 1,
  },
  cardText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  cardTextHighlighted: {
    fontSize: 18,
    fontWeight: '700',
    color: '#27AE60',
  },
  cardRawTranscript: {
    fontSize: 13,
    color: '#6B6B6B',
    marginTop: 2,
    fontStyle: 'italic',
  },
  cardHint: {
    fontSize: 12,
    color: '#27AE60',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  // --- Keyboard overlay ---
  keyboardCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: LAYOUT.screenPadding,
    marginBottom: 12,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#2B7A78',
  },
  keyboardRow: {
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
  keyboardClose: {
    marginLeft: 8,
    padding: 4,
  },
  keyboardCloseText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#999',
  },

  // --- Menu ---
  menu: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: LAYOUT.screenPadding,
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
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

  // --- Intro banner ---
});
