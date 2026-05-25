import { Pressable, Text, StyleSheet } from 'react-native';
import { LAYOUT, TYPOGRAPHY, MAX_FONT_SCALE } from '../../constants/config';

interface FlowCardProps {
  title: string;
  subtitle?: string;
  disabled?: boolean;
  onPress: () => void;
}

export function FlowCard({ title, subtitle, disabled, onPress }: FlowCardProps) {
  return (
    <Pressable
      style={[styles.card, disabled && styles.disabled]}
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.title, disabled && styles.disabledText]}>{title}</Text>
      {subtitle && (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.subtitle, disabled && styles.disabledText]}>{subtitle}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    // minHeight (not fixed height) so the card grows with larger Dynamic Type
    // instead of clipping the title/subtitle.
    minHeight: LAYOUT.flowCardHeight,
    borderRadius: 12,
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: LAYOUT.screenPadding,
    marginBottom: LAYOUT.itemGap,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  disabled: { backgroundColor: '#F0F0EC' },
  title: { fontSize: TYPOGRAPHY.listItem.size, fontWeight: TYPOGRAPHY.listItem.weight, color: '#1A1A1A' },
  subtitle: { fontSize: TYPOGRAPHY.itemLabel.size, color: '#6B6B6B', marginTop: 4 },
  disabledText: { color: '#A0A0A0' },
});
