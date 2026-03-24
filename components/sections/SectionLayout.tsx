import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { PhraseSection } from './PhraseSection';
import { ErrorBoundary } from '../shared/ErrorBoundary';
import { OfflineBanner } from '../shared/OfflineBanner';
import { LAYOUT, TYPOGRAPHY } from '../../constants/config';

interface SectionLayoutProps {
  headerContent: React.ReactNode;
  itemsContent: React.ReactNode;
  onPhraseSave: () => void;
  onPhraseNavigateUp: () => void;
}

export function SectionLayout({
  headerContent,
  itemsContent,
  onPhraseSave,
  onPhraseNavigateUp,
}: SectionLayoutProps) {
  const router = useRouter();

  return (
    <ErrorBoundary>
      <SafeAreaView style={styles.container}>
        {/* Section 1: Nav */}
        <View style={styles.nav}>
          <Pressable onPress={() => router.push('/(app)/settings' as never)}>
            <Text style={styles.navIcon}>|||</Text>
          </Pressable>
          <Pressable onPress={() => {/* Profile/account */}}>
            <Text style={styles.navIcon}>@</Text>
          </Pressable>
        </View>

        {/* Offline indicator — shows amber banner when network is unavailable */}
        <OfflineBanner />

        {/* Section 2: Header (Intent or Category) */}
        <View style={styles.header}>
          {headerContent}
        </View>

        {/* Section 3: Items (Predictions, Common Items, or Saved Phrases) */}
        <View style={styles.items}>
          {itemsContent}
        </View>

        {/* Section 4: Phrase bar */}
        <PhraseSection
          onNavigateUp={onPhraseNavigateUp}
          onSave={onPhraseSave}
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
    justifyContent: 'space-between',
    paddingHorizontal: LAYOUT.screenPadding,
    paddingVertical: 12,
  },
  navIcon: {
    fontSize: TYPOGRAPHY.navBar.size,
    color: '#1A1A1A',
    padding: 8,
  },
  header: {
    minHeight: LAYOUT.headerHeight,
    justifyContent: 'center',
    paddingHorizontal: LAYOUT.screenPadding,
  },
  items: {
    flex: 1,
    paddingHorizontal: LAYOUT.screenPadding,
  },
});
