import { Pressable, StyleSheet, Text } from 'react-native';

import { colors } from '@/lib/theme';

/** Selectable dark-theme chip. Touch target is at least 44dp. */
export function Chip({
  label,
  active = false,
  onPress,
  testID,
  accessibilityLabel,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  testID?: string;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      testID={testID}
      style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.muted, fontSize: 14 },
  chipTextActive: { color: colors.primaryText, fontWeight: '600' },
});
