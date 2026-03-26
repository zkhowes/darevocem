import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
// Debug overlay — no store dependencies, uses its own global log

declare const __DEV__: boolean;

interface DebugEntry {
  timestamp: number;
  action: string;
  fullPhrase: string;
  predictions: string[];
  triedItems: string[];
  latencyMs?: number;
  source: string; // 'claude' | 'fallback' | 'refine'
  focusedItem?: string;
  error?: string;
}

// Global log that components can push to
const debugLog: DebugEntry[] = [];
let listeners: (() => void)[] = [];

export function logPredictionDebug(entry: DebugEntry) {
  debugLog.unshift(entry); // newest first
  if (debugLog.length > 20) debugLog.pop();
  listeners.forEach((fn) => fn());
}

/**
 * Dev-only overlay that shows prediction request/response data.
 * Tap the "DBG" button to toggle visibility.
 */
export function PredictionDebug() {
  if (!__DEV__) return null;

  const [visible, setVisible] = useState(false);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const listener = () => forceUpdate((n) => n + 1);
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((fn) => fn !== listener);
    };
  }, []);

  return (
    <>
      <Pressable
        style={styles.toggleButton}
        onPress={() => setVisible((v) => !v)}
      >
        <Text style={styles.toggleText}>DBG</Text>
      </Pressable>

      {visible && (
        <View style={styles.overlay}>
          <ScrollView style={styles.scroll}>
            <Text style={styles.header}>Prediction Debug ({debugLog.length} entries)</Text>
            {debugLog.map((entry, i) => (
              <View key={i} style={styles.entry}>
                <Text style={styles.action}>{entry.action}</Text>
                <Text style={styles.detail}>phrase: "{entry.fullPhrase}"</Text>
                {entry.focusedItem && (
                  <Text style={styles.detail}>focused: "{entry.focusedItem}"</Text>
                )}
                <Text style={styles.detail}>
                  tried: [{entry.triedItems.join(', ')}]
                </Text>
                <Text style={styles.detail}>
                  results ({entry.source}, {entry.latencyMs ?? '?'}ms):
                </Text>
                {entry.error && (
                  <Text style={styles.errorText}>ERROR: {entry.error}</Text>
                )}
                {entry.predictions.map((p, j) => (
                  <Text key={j} style={styles.prediction}>  {j + 1}. {p}</Text>
                ))}
              </View>
            ))}
            {debugLog.length === 0 && (
              <Text style={styles.detail}>No predictions yet</Text>
            )}
          </ScrollView>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  toggleButton: {
    position: 'absolute',
    top: 54,
    left: 16,
    zIndex: 100,
    backgroundColor: '#333',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  toggleText: {
    color: '#0F0',
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  overlay: {
    position: 'absolute',
    top: 80,
    left: 8,
    right: 8,
    bottom: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    borderRadius: 8,
    zIndex: 99,
    padding: 12,
  },
  scroll: {
    flex: 1,
  },
  header: {
    color: '#0F0',
    fontSize: 13,
    fontFamily: 'monospace',
    fontWeight: '700',
    marginBottom: 8,
  },
  entry: {
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    paddingBottom: 8,
    marginBottom: 8,
  },
  action: {
    color: '#FF0',
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  detail: {
    color: '#AAA',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  errorText: {
    color: '#F44',
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  prediction: {
    color: '#0FF',
    fontSize: 11,
    fontFamily: 'monospace',
  },
});
