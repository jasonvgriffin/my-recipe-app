import { StyleSheet, Text, View } from 'react-native';

import { Chip } from '@/components/chip';
import { useColors } from '@/hooks/use-theme';
import { UNCATEGORIZED_LABEL, type Category } from '@/types/recipe';

/**
 * Category chips (spec #3). v1.0.6: a recipe can be in SEVERAL categories, so the chips are multi-select (tap to
 * toggle; a selected chip is filled and shows a ✓). “Uncategorized” is not a chip: it is automatic when nothing is
 * selected, which the hint under the chips says.
 */
export function CategoryChips({
  categories,
  selectedIds,
  onToggle,
  testIDPrefix = 'category',
  showUncategorizedHint = true,
}: {
  categories: Category[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  testIDPrefix?: string;
  showUncategorizedHint?: boolean;
}) {
  const colors = useColors();
  const none = !selectedIds.some((id) => categories.some((c) => c.id === id));
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {categories.map((c) => (
          <Chip
            key={c.id}
            checkable
            label={c.name}
            active={selectedIds.includes(c.id)}
            onPress={() => onToggle(c.id)}
            testID={`${testIDPrefix}-${c.id}`}
            accessibilityLabel={`Category ${c.name}`}
          />
        ))}
      </View>
      {showUncategorizedHint && none ? (
        <Text style={[styles.hint, { color: colors.muted }]} testID={`${testIDPrefix}-uncategorized-hint`}>
          No category selected: shows under {UNCATEGORIZED_LABEL}.
        </Text>
      ) : null}
    </View>
  );
}

/** Toggle one id in a category list (keeps order; adds at the end). */
export function toggleCategoryId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hint: { fontSize: 13 },
});
