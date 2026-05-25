import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { speakSystem, stopSpeaking } from '../../services/tts';
import { LAYOUT, MAX_FONT_SCALE } from '../../constants/config';

interface TipCardProps {
  /** Heading shown above the body. */
  title: string;
  /** Body text — shown and read aloud. */
  body: string;
  /** Optional small hint line under the body (e.g. where to find a phrase). */
  hint?: string;
  /** Dismiss handler — fires on the "Got it" button. */
  onDismiss: () => void;
}

// Home-screen rotating tip. The user finds reading hard, so a prominent speak
// icon reads the tip aloud in the system voice. Tapping it again stops. The
// card is dismissed by "Got it" or — handled by the parent — when the user
// navigates away.
export function TipCard({ title, body, hint, onDismiss }: TipCardProps) {
  const [speaking, setSpeaking] = useState(false);

  const handleSpeak = useCallback(async () => {
    if (speaking) {
      await stopSpeaking();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    // Read the title + body so the user gets the full context aloud.
    await speakSystem(`${title}. ${body}`, { onDone: () => setSpeaking(false) });
  }, [speaking, title, body]);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.label} maxFontSizeMultiplier={MAX_FONT_SCALE}>{title}</Text>
        <Pressable
          style={[styles.speakButton, speaking && styles.speakButtonActive]}
          onPress={handleSpeak}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={speaking ? 'Stop reading' : 'Read this aloud'}
        >
          <Ionicons
            name={speaking ? 'stop' : 'volume-high'}
            size={22}
            color={speaking ? '#FFFFFF' : '#7B68AE'}
          />
        </Pressable>
      </View>

      <Text style={styles.body} maxFontSizeMultiplier={MAX_FONT_SCALE}>{body}</Text>

      {hint && (
        <Text style={styles.hint} maxFontSizeMultiplier={MAX_FONT_SCALE}>{hint}</Text>
      )}

      <Pressable style={styles.dismiss} onPress={onDismiss} hitSlop={8}>
        <Text style={styles.dismissText} maxFontSizeMultiplier={MAX_FONT_SCALE}>Got it</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#7B68AE',
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: LAYOUT.itemGap,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#7B68AE',
    letterSpacing: 1,
    textTransform: 'uppercase',
    flex: 1,
  },
  speakButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F0EDF7',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  speakButtonActive: {
    backgroundColor: '#7B68AE',
  },
  body: {
    fontSize: 20,
    lineHeight: 28,
    color: '#1A1A1A',
    fontWeight: '500',
  },
  hint: {
    fontSize: 14,
    color: '#6B6B6B',
    marginTop: 10,
  },
  dismiss: {
    alignSelf: 'flex-end',
    marginTop: 12,
    backgroundColor: '#7B68AE',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  dismissText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
