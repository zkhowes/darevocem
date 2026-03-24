import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useAuthStore } from '../stores/auth';

export default function LoginScreen() {
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Dare Vocem</Text>
      <Text style={styles.subtitle}>to give voice</Text>
      <Pressable style={styles.button} onPress={signInWithGoogle}>
        <Text style={styles.buttonText}>Sign in with Google</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#F5F5F0', padding: 20,
  },
  title: {
    fontSize: 36, fontWeight: '700', color: '#1A1A1A',
    letterSpacing: 4, marginBottom: 8,
  },
  subtitle: {
    fontSize: 18, fontWeight: '400', color: '#6B6B6B',
    fontStyle: 'italic', marginBottom: 48,
  },
  button: {
    backgroundColor: '#FFFFFF', paddingVertical: 18, paddingHorizontal: 32,
    borderRadius: 12, borderWidth: 1, borderColor: '#D5D5D0',
    minWidth: 280, alignItems: 'center',
  },
  buttonText: {
    fontSize: 20, fontWeight: '600', color: '#1A1A1A',
  },
});
