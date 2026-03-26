import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';
import { WheelPicker } from '../shared/WheelPicker';
import { useFocusStore } from '../../stores/focus';
import { useCompositionStore } from '../../stores/composition';
import { LAYOUT, TYPOGRAPHY } from '../../constants/config';
import type { GestureAction, WheelPickerItem } from '../../types';

interface PhraseComposeSectionProps {
  onPhraseSelect: (text: string) => void;
  onSwitchToPredict: () => void;
}

export function PhraseComposeSection({ onPhraseSelect, onSwitchToPredict }: PhraseComposeSectionProps) {
  const predictions = useCompositionStore((s) => s.predictions);
  const isLoading = useCompositionStore((s) => s.isLoading);
  const phraseSource = useCompositionStore((s) => s.phraseSource);
  const composeIndex = useFocusStore((s) => s.composeIndex);
  const setComposeIndex = useFocusStore((s) => s.setComposeIndex);
  const setComposeListSize = useFocusStore((s) => s.setComposeListSize);
  const [contextMenuVisible, setContextMenuVisible] = useState(false);
  const [contextMenuItem, setContextMenuItem] = useState<string | null>(null);

  React.useEffect(() => {
    setComposeListSize(predictions.length);
  }, [predictions.length]);

  // Convert to WheelPickerItems
  const wheelItems: WheelPickerItem[] = predictions.map((p) => ({
    id: p.id,
    text: p.text,
    itemType: p.itemType === 'common' ? 'common' : p.itemType === 'saved' ? 'saved' : 'prediction',
    color: p.itemType === 'common' ? '#2B7A78' : p.itemType === 'saved' ? '#7B68AE' : '#E07B2E',
    metadata: { rank: p.rank },
  }));

  const handleFocusChange = useCallback((index: number) => {
    setComposeIndex(index);
  }, [setComposeIndex]);

  const handleGesture = useCallback(
    (gesture: GestureAction, item: WheelPickerItem, index: number) => {
      switch (gesture.type) {
        case 'double-tap':
          // In phrase mode: replace the current phrase
          onPhraseSelect(item.text);
          break;
        case 'long-press':
          // Show context menu with "Compose" option
          setContextMenuItem(item.text);
          setContextMenuVisible(true);
          break;
      }
    },
    [onPhraseSelect],
  );

  const handleCompose = useCallback(() => {
    setContextMenuVisible(false);
    setContextMenuItem(null);
    // If a specific item was long-pressed, select it first
    if (contextMenuItem) {
      onPhraseSelect(contextMenuItem);
    }
    // Then switch to predict mode
    onSwitchToPredict();
  }, [contextMenuItem, onPhraseSelect, onSwitchToPredict]);

  const renderItem = useCallback(
    (item: WheelPickerItem, isFocused: boolean) => (
      <View style={styles.itemContent}>
        <Text style={[styles.itemLabel, isFocused && styles.focusedLabel]}>
          {item.itemType === 'common' ? 'C' : 'S'}
          {(item.metadata?.rank as number ?? 0) + 1}
        </Text>
        <Text
          style={isFocused ? styles.focusedText : styles.itemText}
          numberOfLines={3}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
        >
          {item.text}
        </Text>
      </View>
    ),
    [],
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.shimmer} />
        ))}
      </View>
    );
  }

  return (
    <>
      <WheelPicker
        items={wheelItems}
        focusedIndex={composeIndex}
        onFocusChange={handleFocusChange}
        onGesture={handleGesture}
        renderItem={renderItem}
      />

      {/* Context menu for "Compose" option */}
      <Modal
        visible={contextMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setContextMenuVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setContextMenuVisible(false)}>
          <View style={styles.contextMenu}>
            <Text style={styles.contextMenuTitle}>
              {contextMenuItem ? `"${contextMenuItem.slice(0, 30)}${contextMenuItem.length > 30 ? '...' : ''}"` : ''}
            </Text>
            <Pressable style={styles.contextMenuItem} onPress={handleCompose}>
              <Text style={styles.contextMenuText}>Compose</Text>
              <Text style={styles.contextMenuHint}>Add to this phrase with predictions</Text>
            </Pressable>
            <Pressable
              style={[styles.contextMenuItem, styles.contextMenuCancel]}
              onPress={() => setContextMenuVisible(false)}
            >
              <Text style={styles.contextMenuCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  itemLabel: {
    fontSize: TYPOGRAPHY.itemLabel.size,
    color: '#6B6B6B',
    marginRight: 8,
  },
  focusedLabel: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  itemText: {
    fontSize: LAYOUT.wheelPickerItemFontSize,
    fontWeight: '500',
    color: '#1A1A1A',
    flex: 1,
  },
  focusedText: {
    fontSize: LAYOUT.wheelPickerFocusedFontSize,
    fontWeight: '700',
    color: '#FFFFFF',
    flex: 1,
  },
  loadingContainer: {
    gap: LAYOUT.itemGap,
    paddingHorizontal: LAYOUT.screenPadding,
  },
  shimmer: {
    height: LAYOUT.wheelPickerItemHeight,
    backgroundColor: '#D5D5D0',
    borderRadius: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contextMenu: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    width: '80%',
    maxWidth: 320,
  },
  contextMenuTitle: {
    fontSize: 14,
    color: '#6B6B6B',
    marginBottom: 16,
    textAlign: 'center',
  },
  contextMenuItem: {
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E0',
  },
  contextMenuText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#E07B2E',
    textAlign: 'center',
  },
  contextMenuHint: {
    fontSize: 13,
    color: '#6B6B6B',
    textAlign: 'center',
    marginTop: 4,
  },
  contextMenuCancel: {
    marginTop: 8,
  },
  contextMenuCancelText: {
    fontSize: 16,
    color: '#6B6B6B',
    textAlign: 'center',
  },
});
