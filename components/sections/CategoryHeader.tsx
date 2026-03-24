import React, { useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import { GestureArea } from '../gestures/GestureArea';
import type { GestureAction } from '../../types';
import { LAYOUT, TYPOGRAPHY } from '../../constants/config';

interface CategoryHeaderProps {
  categories: string[];
  onCategoryChange: (category: string) => void;
  onNavigateHome: () => void;
  onFocusDown: () => void;
}

/**
 * Swipeable category header for Common and Saved screens.
 * Left/right cycles categories; up/down navigates the section hierarchy.
 */
export function CategoryHeader({
  categories,
  onCategoryChange,
  onNavigateHome,
  onFocusDown,
}: CategoryHeaderProps) {
  const [index, setIndex] = useState(0);

  const handleAction = (action: GestureAction) => {
    if (action.type === 'swipe') {
      switch (action.direction) {
        case 'left':
          setIndex((prev) => {
            const next = (prev - 1 + categories.length) % categories.length;
            onCategoryChange(categories[next]);
            return next;
          });
          break;
        case 'right':
          setIndex((prev) => {
            const next = (prev + 1) % categories.length;
            onCategoryChange(categories[next]);
            return next;
          });
          break;
        case 'up': onNavigateHome(); break;
        case 'down': onFocusDown(); break;
      }
    }
  };

  return (
    <GestureArea onAction={handleAction} style={styles.container}>
      <Text style={styles.label}>C{index + 1}: </Text>
      <Text style={styles.categoryText}>{categories[index]}</Text>
    </GestureArea>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: LAYOUT.headerHeight,
    justifyContent: 'center',
    paddingHorizontal: LAYOUT.screenPadding,
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: { fontSize: TYPOGRAPHY.itemLabel.size, color: '#6B6B6B' },
  categoryText: {
    fontSize: TYPOGRAPHY.header.size,
    fontWeight: TYPOGRAPHY.header.weight,
    color: '#1A1A1A',
  },
});
