import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import { LAYOUT } from '../../constants/config';

export type InputMode = 'mic' | 'keyboard' | 'camera' | null;

interface ComposeInputOverlayProps {
  mode: InputMode;
  /** True while mic is actively recording */
  isListening: boolean;
  /** Live transcript from speech recognition */
  transcript: string | null;
  /** True while processing (transcription, image analysis) */
  isProcessing: boolean;
  /** Called when user taps to stop mic recording */
  onMicStop: () => void;
  /** Called when user submits keyboard text */
  onKeyboardSubmit: (text: string) => void;
  /** Called to dismiss the overlay */
  onDismiss: () => void;
}

/**
 * Overlay shown in the compose section when mic, keyboard, or camera is active.
 * Replaces the prediction wheel temporarily while input is being captured.
 */
export function ComposeInputOverlay({
  mode,
  isListening,
  transcript,
  isProcessing,
  onMicStop,
  onKeyboardSubmit,
  onDismiss,
}: ComposeInputOverlayProps) {
  const [keyboardText, setKeyboardText] = useState('');
  const keyboardRef = useRef<TextInput>(null);

  // Pulsing animation for mic
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (isListening) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1.12, { duration: 500 }),
          withTiming(1, { duration: 500 }),
        ),
        -1,
      );
    } else {
      cancelAnimation(pulse);
      pulse.value = withTiming(1, { duration: 150 });
    }
  }, [isListening, pulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  // Auto-focus keyboard input
  useEffect(() => {
    if (mode === 'keyboard') {
      setKeyboardText('');
      setTimeout(() => keyboardRef.current?.focus(), 100);
    }
  }, [mode]);

  if (!mode) return null;

  // --- Mic Mode ---
  if (mode === 'mic') {
    return (
      <View style={styles.container}>
        {isProcessing ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#E07B2E" />
            <Text style={styles.processingText}>Processing...</Text>
          </View>
        ) : (
          <>
            <Animated.View style={pulseStyle}>
              <Pressable
                style={[styles.micCircle, isListening && styles.micCircleActive]}
                onPress={onMicStop}
              >
                {isListening ? (
                  <View style={styles.recordingDot} />
                ) : (
                  <Text style={styles.micIcon}>mic</Text>
                )}
              </Pressable>
            </Animated.View>

            {isListening && (
              <Text style={styles.listeningLabel}>LISTENING — tap to stop</Text>
            )}

            {transcript && (
              <View style={styles.transcriptBubble}>
                <Text style={styles.transcriptText}>"{transcript}"</Text>
              </View>
            )}

            {!isListening && !transcript && (
              <Text style={styles.hint}>Listening for next word...</Text>
            )}
          </>
        )}

        <Pressable style={styles.dismissButton} onPress={onDismiss}>
          <Text style={styles.dismissText}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  // --- Keyboard Mode ---
  if (mode === 'keyboard') {
    return (
      <View style={styles.container}>
        <Text style={styles.keyboardLabel}>Type a word</Text>
        <View style={styles.keyboardRow}>
          <TextInput
            ref={keyboardRef}
            style={styles.keyboardInput}
            value={keyboardText}
            onChangeText={setKeyboardText}
            placeholder="Type here..."
            placeholderTextColor="#A0A0A0"
            returnKeyType="go"
            onSubmitEditing={() => {
              if (keyboardText.trim()) {
                onKeyboardSubmit(keyboardText.trim());
                setKeyboardText('');
              }
            }}
            autoFocus
          />
          {keyboardText.trim().length > 0 && (
            <Pressable
              style={styles.goButton}
              onPress={() => {
                onKeyboardSubmit(keyboardText.trim());
                setKeyboardText('');
              }}
            >
              <Text style={styles.goButtonText}>Go</Text>
            </Pressable>
          )}
        </View>
        <Pressable style={styles.dismissButton} onPress={onDismiss}>
          <Text style={styles.dismissText}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  // --- Camera Mode ---
  if (mode === 'camera') {
    if (isProcessing) {
      return (
        <View style={styles.container}>
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#E07B2E" />
            <Text style={styles.processingText}>Analyzing image...</Text>
          </View>
          <Pressable style={styles.dismissButton} onPress={onDismiss}>
            <Text style={styles.dismissText}>Cancel</Text>
          </Pressable>
        </View>
      );
    }

    // Camera UI is launched externally; this shows while waiting
    return (
      <View style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#E07B2E" />
          <Text style={styles.processingText}>Opening camera...</Text>
        </View>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: LAYOUT.screenPadding,
    gap: 16,
  },
  center: {
    alignItems: 'center',
    gap: 12,
  },

  // Mic
  micCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: '#E07B2E',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  micCircleActive: {
    backgroundColor: '#FFF0F0',
    borderColor: '#E74C3C',
  },
  micIcon: {
    fontSize: 22,
    fontWeight: '700',
    color: '#E07B2E',
  },
  recordingDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#E74C3C',
  },
  listeningLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#E74C3C',
    letterSpacing: 1,
  },
  transcriptBubble: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#27AE60',
    alignSelf: 'stretch',
  },
  transcriptText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  hint: {
    fontSize: 14,
    color: '#6B6B6B',
  },
  processingText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6B6B6B',
  },

  // Keyboard
  keyboardLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B6B6B',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  keyboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderColor: '#2B7A78',
  },
  keyboardInput: {
    flex: 1,
    fontSize: 20,
    color: '#1A1A1A',
    paddingVertical: 4,
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

  // Dismiss
  dismissButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  dismissText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#C0392B',
  },
});
