import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { useAuthStore } from '../stores/auth';
import { LAYOUT } from '../constants/config';

// Colors will move to constants/theme.ts in Task 5
const COLORS = {
  background: '#F5F5F0',
  text: '#1A1A1A',
  textMuted: '#6B6B6B',
  surface: '#FFFFFF',
  border: '#D5D5D0',
  error: '#C53030',
} as const;

export default function LoginScreen() {
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    try {
      setError(null);
      await signInWithGoogle();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      Alert.alert('Sign in error', msg);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Dare Vocem</Text>
      <Text style={styles.subtitle}>to give voice</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={styles.button} onPress={handleSignIn}>
        <Text style={styles.buttonText}>Sign in with Google</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: LAYOUT.screenPadding,
  },
  title: {
    fontSize: 36,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: 4,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '400',
    color: COLORS.textMuted,
    fontStyle: 'italic',
    marginBottom: 48,
  },
  error: {
    fontSize: 16,
    color: COLORS.error,
    marginBottom: 16,
    textAlign: 'center',
  },
  button: {
    backgroundColor: COLORS.surface,
    paddingVertical: 18,
    paddingHorizontal: 32,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    minWidth: 280,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.text,
  },
});
