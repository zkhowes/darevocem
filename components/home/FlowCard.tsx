import { Pressable, Text, StyleSheet } from 'react-native';
import { LAYOUT, TYPOGRAPHY } from '../../constants/config';

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
      <Text style={[styles.title, disabled && styles.disabledText]}>{title}</Text>
      {subtitle && (
        <Text style={[styles.subtitle, disabled && styles.disabledText]}>{subtitle}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    height: LAYOUT.flowCardHeight,
    borderRadius: 12,
    justifyContent: 'center',
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
