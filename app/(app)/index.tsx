import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlowCard } from '../../components/home/FlowCard';
import { LAYOUT, TYPOGRAPHY } from '../../constants/config';
import { ErrorBoundary } from '../../components/shared/ErrorBoundary';

export default function HomeScreen() {
  const router = useRouter();

  return (
    <ErrorBoundary>
      <SafeAreaView style={styles.container}>
        <Text style={styles.title}>DARE VOCEM</Text>

        <View style={styles.cards}>
          <FlowCard
            title="Record"
            subtitle="Coming soon"
            disabled
            onPress={() => {}}
          />
          <FlowCard
            title="Predicted"
            onPress={() => router.push('/(app)/compose' as never)}
          />
          <FlowCard
            title="Common"
            onPress={() => router.push('/(app)/common' as never)}
          />
          <FlowCard
            title="Saved"
            onPress={() => router.push('/(app)/saved' as never)}
          />
        </View>
      </SafeAreaView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F0',
    padding: LAYOUT.screenPadding,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
    letterSpacing: 6,
    textAlign: 'center',
    marginVertical: 32,
  },
  cards: {
    flex: 1,
    justifyContent: 'center',
  },
});
