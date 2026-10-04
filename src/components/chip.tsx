import { Pressable, Text } from 'react-native';

import { makeStyles } from '@/hooks/use-theme';

/** Selectable dark-theme chip. Touch target is at least 44dp. */
export function Chip({
  label,
  active = false,
  onPress,
  testID,
  accessibilityLabel,
  checkable = false,
}: {
  label: string;
  active?: boolean;
  /** Multi-select chip: shows a checkmark when active and reports itself as a checkbox. */
  checkable?: boolean;
  onPress?: () => void;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole={checkable ? 'checkbox' : 'button'}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={checkable ? { checked: active, selected: active } : { selected: active }}
      onPress={onPress}
      testID={testID}
      style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {checkable && active ? `✓ ${label}` : label}
      </Text>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
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
}));
