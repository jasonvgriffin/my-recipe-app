import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/lib/theme';

const STARS = [1, 2, 3, 4, 5] as const;

/**
 * Five-star rating (spec #22). Without `onChange` it is display-only.
 * Pressing the current value clears the rating.
 */
export function StarRating({
  value,
  onChange,
  testID = 'star-rating',
  size = 22,
}: {
  value?: number;
  onChange?: (rating: number | undefined) => void;
  testID?: string;
  size?: number;
}) {
  return (
    <View style={styles.row} testID={testID} accessibilityRole="adjustable" accessibilityLabel="Rating">
      {STARS.map((n) => {
        const filled = (value ?? 0) >= n;
        return (
          <Pressable
            key={n}
            disabled={!onChange}
            accessibilityRole="button"
            accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`}
            accessibilityState={{ selected: filled }}
            testID={`${testID}-${n}`}
            onPress={() => onChange?.(value === n ? undefined : n)}
            hitSlop={onChange ? 4 : 0}
            style={[styles.star, !onChange && styles.starStatic]}>
            <Text style={{ fontSize: size, color: filled ? colors.primary : colors.muted, lineHeight: size + 4 }}>
              {filled ? '★' : '☆'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  star: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  starStatic: { minWidth: 22, minHeight: 22 },
});
