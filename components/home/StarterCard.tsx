import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LAYOUT } from '../../constants/config';
import type { WheelPickerItem } from '../../types';

interface StarterCardProps {
  item: WheelPickerItem;
  isFocused: boolean;
  modifierText?: string | null;
}

export function StarterCard({ item, isFocused, modifierText }: StarterCardProps) {
  const displayText = modifierText ?? item.text;

  return (
    <View style={styles.content}>
      <Text style={[
        styles.typeLabel,
        isFocused && styles.focusedLabel,
      ]}>
        {item.itemType === 'prediction' ? 'Predicted' : item.itemType === 'common' ? 'Common' : 'Saved'}
      </Text>
      <Text
        style={[
          isFocused ? styles.focusedText : styles.text,
        ]}
        numberOfLines={2}
      >
        {displayText}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  typeLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B6B6B',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  focusedLabel: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  text: {
    fontSize: LAYOUT.wheelPickerItemFontSize,
    fontWeight: '500',
    color: '#1A1A1A',
  },
  focusedText: {
    fontSize: LAYOUT.wheelPickerFocusedFontSize,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
