import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import { ErrorBoundary } from '../../components/shared/ErrorBoundary';
import { MicDebugOverlay } from '../../components/shared/MicDebugOverlay';
import { ContextMenu } from '../../components/shared/ContextMenu';
import { useCompositionStore } from '../../stores/composition';
import { getTimeOfDay } from '../../services/context';
import { getPredictions, getCommonPhrases } from '../../services/predictions';
import { useLiveSpeech } from '../../hooks/useLiveSpeech';
import { INTENTS, DEFAULT_INTENT_BY_TIME } from '../../constants/intents';
import { LAYOUT } from '../../constants/config';
import { supabase } from '../../services/supabase';
import type { TranscriptionResult, ComposeItem, SavedPhrase } from '../../types';

const INTRO_SEEN_KEY = 'darevocem_intro_phrase_seen';

// Max prediction cards shown on home (3 normally, 4 if speech/keyboard produced P0)
const MAX_PREDICTIONS = 3;

declare const __DEV__: boolean;

export default function HomeScreen() {
  const router = useRouter();
  const [contextMenuVisible, setContextMenuVisible] = useState(false);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [keyboardText, setKeyboardText] = useState('');
  const keyboardRef = useRef<TextInput>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [introPhrase, setIntroPhrase] = useState<string | null>(null);

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

  // Load common phrases (time-of-day based) and saved phrases on mount
  useEffect(() => {
    const timeOfDay = getTimeOfDay();
    getCommonPhrases(timeOfDay).then((items) => {
      setCommonPhrases(items.slice(0, 3));
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
  }, []);

  // Intro phrase — shown once after onboarding
  useEffect(() => {
    AsyncStorage.getItem(INTRO_SEEN_KEY).then((seen) => {
      if (seen) return;
      supabase
        .from('saved_phrases')
        .select('text')
        .ilike('category', 'personal')
        .ilike('text', '%aphasia%')
        .limit(1)
        .then(({ data }) => {
          if (data && data.length > 0) setIntroPhrase(data[0].text);
        });
    });
  }, []);

  const dismissIntro = useCallback(() => {
    AsyncStorage.setItem(INTRO_SEEN_KEY, 'true');
    setIntroPhrase(null);
  }, []);

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
  }, [finalTranscript, isListening]);

  // Navigate to compose with a prediction card
  const handleCardTap = useCallback(
    (intentText: string) => {
      const store = useCompositionStore.getState();
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
    },
    [router],
  );

  // Navigate to compose with the extracted speech intent
  const handleSpeechIntentTap = useCallback(() => {
    if (!extractedIntent?.intent) return;

    const intent = extractedIntent.intent;
    const store = useCompositionStore.getState();
    store.preload(intent, []);
    if (extractedIntent.descriptors.length > 0) {
      store.setVoiceDescriptors(extractedIntent.descriptors);
    }
    store.setLoading(true);

    getPredictions(intent, getTimeOfDay())
      .then((predictions) => {
        useCompositionStore.getState().setPredictions(predictions);
      })
      .finally(() => {
        useCompositionStore.getState().setLoading(false);
      });

    setExtractedIntent(null);
    router.push({ pathname: '/(app)/compose', params: { type: 'prediction', value: intent } } as never);
  }, [extractedIntent, router]);

  // Keyboard submit
  const handleKeyboardSubmit = useCallback(() => {
    if (keyboardText.trim()) {
      handleCardTap(keyboardText.trim());
      setKeyboardText('');
      setShowKeyboard(false);
    }
  }, [keyboardText, handleCardTap]);

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

  // Pulsing animation for mic button when listening
  const micPulse = useSharedValue(1);
  useEffect(() => {
    if (isListening) {
      micPulse.value = withRepeat(
        withSequence(
          withTiming(1.15, { duration: 600 }),
          withTiming(1, { duration: 600 }),
        ),
        -1,
      );
    } else {
      cancelAnimation(micPulse);
      micPulse.value = withTiming(1, { duration: 200 });
    }
  }, [isListening, micPulse]);

  const micAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: micPulse.value }],
  }));

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

        {/* Intro banner */}
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

        {/* === Mic Button (centered, prominent) === */}
        <View style={styles.micSection}>
          <Animated.View style={micAnimatedStyle}>
            <Pressable
              style={[
                styles.micButton,
                isListening && styles.micButtonActive,
              ]}
              onPress={handleMicTap}
              onLongPress={() => setContextMenuVisible(true)}
              delayLongPress={2000}
            >
              {isListening ? (
                <>
                  {/* Red recording dot */}
                  <View style={styles.recordingDot} />
                  <Text style={styles.micButtonText}>Tap to stop</Text>
                </>
              ) : (
                <>
                  <Text style={styles.micIcon}>mic</Text>
                  <Text style={styles.micButtonText}>Tap to speak</Text>
                </>
              )}
            </Pressable>
          </Animated.View>

          {/* Volume level bar — visible while listening */}
          {isListening && (
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
          )}
        </View>

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

        {/* Context menu */}
        <ContextMenu
          visible={contextMenuVisible}
          onClose={() => setContextMenuVisible(false)}
          onKeyboard={() => {
            setContextMenuVisible(false);
            setShowKeyboard(true);
          }}
          onSave={() => setContextMenuVisible(false)}
        />

        {/* === Home Sections: Predicted, Common, Saved === */}
        <ScrollView
          style={styles.cardList}
          contentContainerStyle={styles.cardListContent}
          showsVerticalScrollIndicator={false}
        >
          {/* --- Predicted Section --- */}
          <Text style={styles.sectionLabel}>PREDICTED</Text>

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
                    <Text style={styles.cardText} numberOfLines={1}>{phrase.text}</Text>
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
                      <Text style={styles.cardText} numberOfLines={1}>{displayText}</Text>
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

  // --- Mic button ---
  micSection: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  micButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: '#E07B2E',
    alignItems: 'center',
    justifyContent: 'center',
    // Shadow for depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  micButtonActive: {
    backgroundColor: '#FFF0F0',
    borderColor: '#E74C3C',
  },
  micIcon: {
    fontSize: 28,
    fontWeight: '700',
    color: '#E07B2E',
    marginBottom: 4,
  },
  micButtonText: {
    fontSize: 12,
    color: '#6B6B6B',
    fontWeight: '500',
  },
  recordingDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#E74C3C',
    marginBottom: 6,
  },

  // --- Volume bar ---
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
    textTransform: 'uppercase',
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
    alignSelf: 'flex-end',
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
