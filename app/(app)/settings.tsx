import React from 'react';
import { View, Text, Switch, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Slider from '@react-native-community/slider';
import { usePreferencesStore } from '../../stores/preferences';
import { useAuthStore } from '../../stores/auth';
import { ErrorBoundary } from '../../components/shared/ErrorBoundary';
import { LAYOUT, TYPOGRAPHY } from '../../constants/config';

function ProfileCard() {
  const profile = useAuthStore((s) => s.profile);
  if (!profile) return null;
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.displayName || 'User';
  return (
    <View style={styles.profileCard}>
      <View style={styles.profileAvatar}>
        <Text style={styles.profileInitial}>{name[0]?.toUpperCase() ?? '?'}</Text>
      </View>
      <View style={styles.profileInfo}>
        <Text style={styles.profileName}>{name}</Text>
        {profile.dateOfBirth && <Text style={styles.profileDetail}>DOB: {profile.dateOfBirth}</Text>}
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const signOut = useAuthStore((s) => s.signOut);
  const {
    theme, setTheme,
    textScale, setTextScale,
    speechRate, setSpeechRate,
    useSystemTtsOnly, setUseSystemTtsOnly,
    showFallbackButtons, setShowFallbackButtons,
  } = usePreferencesStore();

  return (
    <ErrorBoundary>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
          <Text style={styles.title}>Settings</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView style={styles.scroll}>
          {/* User profile card */}
          <ProfileCard />

          <View style={styles.row}>
            <Text style={styles.label}>Dark mode</Text>
            <Switch
              value={theme === 'dark'}
              onValueChange={(v) => setTheme(v ? 'dark' : 'light')}
            />
          </View>

          <View style={styles.sliderRow}>
            <Text style={styles.label}>Text size ({textScale.toFixed(1)}x)</Text>
            <Slider
              style={styles.slider}
              minimumValue={0.8}
              maximumValue={1.5}
              step={0.1}
              value={textScale}
              onSlidingComplete={setTextScale}
              minimumTrackTintColor="#2B7A78"
            />
          </View>

          <View style={styles.sliderRow}>
            <Text style={styles.label}>Speech rate ({speechRate.toFixed(1)}x)</Text>
            <Slider
              style={styles.slider}
              minimumValue={0.5}
              maximumValue={1.5}
              step={0.1}
              value={speechRate}
              onSlidingComplete={setSpeechRate}
              minimumTrackTintColor="#2B7A78"
            />
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>System voice only</Text>
            <Switch value={useSystemTtsOnly} onValueChange={setUseSystemTtsOnly} />
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Show tap alternatives</Text>
            <Switch value={showFallbackButtons} onValueChange={setShowFallbackButtons} />
          </View>

          <Pressable style={styles.signOut} onPress={signOut}>
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F0' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: LAYOUT.screenPadding, paddingVertical: 16,
  },
  backText: { fontSize: TYPOGRAPHY.navBar.size, color: '#2B7A78' },
  title: { fontSize: TYPOGRAPHY.phraseBar.size, fontWeight: '600', color: '#1A1A1A' },
  scroll: { paddingHorizontal: LAYOUT.screenPadding },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#FFFFFF', borderRadius: 12, padding: 20,
    marginBottom: LAYOUT.itemGap, minHeight: 64,
  },
  sliderRow: {
    backgroundColor: '#FFFFFF', borderRadius: 12, padding: 20,
    marginBottom: LAYOUT.itemGap,
  },
  label: { fontSize: TYPOGRAPHY.listItem.size, fontWeight: '500', color: '#1A1A1A' },
  slider: { width: '100%', height: 40, marginTop: 8 },
  signOut: {
    backgroundColor: '#FFFFFF', borderRadius: 12, padding: 20,
    marginTop: 24, alignItems: 'center',
  },
  signOutText: { fontSize: TYPOGRAPHY.listItem.size, fontWeight: '500', color: '#C0392B' },
  profileCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF', borderRadius: 12, padding: 20,
    marginBottom: 24,
  },
  profileAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#E07B2E', alignItems: 'center', justifyContent: 'center',
    marginRight: 16,
  },
  profileInitial: { fontSize: 22, fontWeight: '700', color: '#FFFFFF' },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 20, fontWeight: '600', color: '#1A1A1A' },
  profileDetail: { fontSize: 14, color: '#6B6B6B', marginTop: 2 },
});
