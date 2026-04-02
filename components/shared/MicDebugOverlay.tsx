import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';

declare const __DEV__: boolean;

export interface MicDebugEntry {
  timestamp: number;
  event: string;
  detail?: string;
}

interface MicDebugOverlayProps {
  /** Current metering level in dB (-160 to 0) */
  meteringDb: number;
  /** Whether speech recognition is active */
  isListening: boolean;
  /** Whether audio recording is active */
  isRecording: boolean;
  /** Current live transcript */
  transcript: string;
  /** Speech recognition error, if any */
  error: string | null;
  /** Duration of current recording in ms */
  durationMs: number;
  /** Log entries */
  log: MicDebugEntry[];
}

/**
 * Dev-only overlay showing mic diagnostics.
 * Toggle with the "MIC DBG" button.
 */
export function MicDebugOverlay({
  meteringDb,
  isListening,
  isRecording,
  transcript,
  error,
  durationMs,
  log,
}: MicDebugOverlayProps) {
  const [visible, setVisible] = useState(false);

  if (!__DEV__) return null;

  // Normalize dB to 0-1 for the level bar (-60 = silence, 0 = max)
  const normalizedLevel = Math.max(0, Math.min(1, (meteringDb + 60) / 60));

  return (
    <>
      {/* Toggle button — always visible in dev */}
      <Pressable
        style={styles.toggleButton}
        onPress={() => setVisible((v) => !v)}
        hitSlop={8}
      >
        <Text style={styles.toggleText}>MIC{'\n'}DBG</Text>
      </Pressable>

      {visible && (
        <View style={styles.overlay}>
          <View style={styles.header}>
            <Text style={styles.headerText}>Mic Debug</Text>
            <Pressable onPress={() => setVisible(false)} hitSlop={8}>
              <Text style={styles.closeText}>X</Text>
            </Pressable>
          </View>

          {/* Status indicators */}
          <View style={styles.row}>
            <View style={[styles.indicator, isRecording && styles.indicatorActive]}>
              <Text style={styles.indicatorText}>REC</Text>
            </View>
            <View style={[styles.indicator, isListening && styles.indicatorActive]}>
              <Text style={styles.indicatorText}>SR</Text>
            </View>
            <Text style={styles.durationText}>
              {(durationMs / 1000).toFixed(1)}s
            </Text>
          </View>

          {/* Metering level bar */}
          <View style={styles.meterContainer}>
            <Text style={styles.meterLabel}>dB: {meteringDb.toFixed(0)}</Text>
            <View style={styles.meterTrack}>
              <View
                style={[
                  styles.meterFill,
                  {
                    width: `${normalizedLevel * 100}%`,
                    backgroundColor:
                      normalizedLevel > 0.7
                        ? '#E74C3C'
                        : normalizedLevel > 0.4
                          ? '#F39C12'
                          : '#27AE60',
                  },
                ]}
              />
            </View>
          </View>

          {/* Live transcript */}
          {transcript ? (
            <View style={styles.transcriptBox}>
              <Text style={styles.transcriptLabel}>TRANSCRIPT</Text>
              <Text style={styles.transcriptText}>{transcript}</Text>
            </View>
          ) : null}

          {/* Error */}
          {error ? (
            <Text style={styles.errorText}>ERR: {error}</Text>
          ) : null}

          {/* Recent log entries */}
          <ScrollView style={styles.logScroll}>
            {log.slice(-15).reverse().map((entry, i) => (
              <Text key={i} style={styles.logEntry}>
                <Text style={styles.logTime}>
                  {new Date(entry.timestamp).toLocaleTimeString('en', {
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </Text>
                {' '}
                <Text style={styles.logEvent}>{entry.event}</Text>
                {entry.detail ? ` ${entry.detail}` : ''}
              </Text>
            ))}
          </ScrollView>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  toggleButton: {
    position: 'absolute',
    top: 60,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
    zIndex: 999,
  },
  toggleText: {
    color: '#0F0',
    fontSize: 9,
    fontFamily: 'monospace',
    fontWeight: '700',
    textAlign: 'center',
  },
  overlay: {
    position: 'absolute',
    top: 100,
    left: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.9)',
    borderRadius: 10,
    padding: 12,
    zIndex: 998,
    maxHeight: 400,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerText: {
    color: '#0F0',
    fontSize: 14,
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  closeText: {
    color: '#999',
    fontSize: 16,
    fontWeight: '700',
    padding: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  indicator: {
    backgroundColor: '#333',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  indicatorActive: {
    backgroundColor: '#E74C3C',
  },
  indicatorText: {
    color: '#FFF',
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  durationText: {
    color: '#CCC',
    fontSize: 12,
    fontFamily: 'monospace',
    marginLeft: 'auto',
  },
  meterContainer: {
    marginBottom: 8,
  },
  meterLabel: {
    color: '#999',
    fontSize: 10,
    fontFamily: 'monospace',
    marginBottom: 2,
  },
  meterTrack: {
    height: 8,
    backgroundColor: '#222',
    borderRadius: 4,
    overflow: 'hidden',
  },
  meterFill: {
    height: '100%',
    borderRadius: 4,
  },
  transcriptBox: {
    backgroundColor: '#1A1A1A',
    borderRadius: 6,
    padding: 8,
    marginBottom: 8,
  },
  transcriptLabel: {
    color: '#666',
    fontSize: 9,
    fontFamily: 'monospace',
    marginBottom: 2,
  },
  transcriptText: {
    color: '#0FF',
    fontSize: 13,
    fontFamily: 'monospace',
  },
  errorText: {
    color: '#E74C3C',
    fontSize: 11,
    fontFamily: 'monospace',
    marginBottom: 8,
  },
  logScroll: {
    maxHeight: 150,
  },
  logEntry: {
    color: '#999',
    fontSize: 10,
    fontFamily: 'monospace',
    lineHeight: 16,
  },
  logTime: {
    color: '#666',
  },
  logEvent: {
    color: '#FF0',
  },
});
