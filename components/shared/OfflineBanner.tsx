import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNetInfo } from '@react-native-community/netinfo';

export function OfflineBanner() {
  const netInfo = useNetInfo();
  if (netInfo.isConnected !== false) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>Offline — using saved predictions</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#FFF3E0',
    paddingVertical: 6,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  text: { fontSize: 14, color: '#6B6B6B' },
});
