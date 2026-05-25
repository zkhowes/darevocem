import { useEffect } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { setAudioModeAsync } from 'expo-audio';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAuthStore } from '../stores/auth';
import { View, ActivityIndicator, StyleSheet, Text, TextInput } from 'react-native';
import { TIMING, MAX_FONT_SCALE } from '../constants/config';
import { ErrorBoundary } from '../components/shared/ErrorBoundary';

// Honor the user's larger iOS system font, but cap how far it can scale so it
// never overflows our containers. Set once at the app root via the host
// component defaults so every Text/TextInput inherits it without per-call
// props. Components with tight containers also use minHeight + numberOfLines.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
((Text as any).defaultProps ??= {}).maxFontSizeMultiplier = MAX_FONT_SCALE;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
((TextInput as any).defaultProps ??= {}).maxFontSizeMultiplier = MAX_FONT_SCALE;

export default function RootLayout() {
  const { session, profile, isLoading, profileLoaded, initialize, cleanup } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    // AAC app: speech must always play, even when the hardware mute switch is on.
    // This sets the iOS audio session category to Playback, which overrides silent mode
    // for all audio including expo-speech (auditory previews) and expo-audio (cloned voice).
    setAudioModeAsync({ playsInSilentMode: true });

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

    const firstSegment = segments[0] as string;
    const inAuthGroup = firstSegment === '(app)';
    const inOnboarding = firstSegment === 'onboarding';

    if (!session) {
      // No session: redirect to login from any screen
      if (firstSegment !== 'login') {
        router.replace('/login' as never);
      }
    } else if (!inAuthGroup && !inOnboarding) {
      // Wait until the profile fetch has settled before deciding — otherwise a
      // fresh login (session set, profile still loading) could flash onboarding.
      if (!profileLoaded) return;

      // Send to onboarding if it's flagged incomplete OR the profile is
      // effectively empty (no name). The empty check is belt-and-suspenders:
      // a profile that was blanked but left onboardingComplete=true would
      // otherwise land on a half-populated home. We treat "no name" as
      // "needs onboarding".
      const profileEmpty = !profile || (!profile.firstName && !profile.lastName && !profile.displayName);
      if (!profile || !profile.onboardingComplete || profileEmpty) {
        router.replace('/onboarding' as never);
      } else {
        router.replace('/(app)' as never);
      }
    }
  }, [session, profile, isLoading, profileLoaded, segments]);

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    // GestureHandlerRootView must wrap every screen — react-native-gesture-handler
    // requires it for any GestureDetector to receive events. Putting it at the
    // root means individual screens don't need their own wrapper.
    <GestureHandlerRootView style={styles.root}>
      <ErrorBoundary>
        <Slot />
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
