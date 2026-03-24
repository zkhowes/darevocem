import { useEffect } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { useAuthStore } from '../stores/auth';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { TIMING } from '../constants/config';
import { ErrorBoundary } from '../components/shared/ErrorBoundary';

export default function RootLayout() {
  const { session, isLoading, initialize, cleanup } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    // Fall back to login if Supabase is unreachable
    const timeout = setTimeout(() => {
      useAuthStore.setState({ isLoading: false });
    }, TIMING.apiTimeoutMs);

    initialize().finally(() => clearTimeout(timeout));

    return () => {
      clearTimeout(timeout);
      cleanup();
    };
  }, []);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(app)';

    if (!session && inAuthGroup) {
      router.replace('/login' as never);
    } else if (session && !inAuthGroup) {
      router.replace('/(app)' as never);
    }
  }, [session, isLoading, segments]);

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <Slot />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
