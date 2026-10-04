import { StyleSheet, View } from 'react-native';

import { Chip } from '@/components/chip';
import { UNCATEGORIZED_LABEL, type Category } from '@/types/recipe';

/**
 * Category chips (spec #3). v1.0.5: `single` = pick ONE category or “Uncategorized” (add / edit / detail
 * screens); `onToggle` then receives the chosen id, or `undefined` for Uncategorized.
 */
export function CategoryChips({
  categories,
  selectedIds,
  onToggle,
  testIDPrefix = 'category',
  single = false,
}: {
  categories: Category[];
  selectedIds: string[];
  onToggle: (id: string | undefined) => void;
  testIDPrefix?: string;
  single?: boolean;
}) {
  const selected = single ? selectedIds.find((id) => categories.some((c) => c.id === id)) : undefined;
  return (
    <View style={styles.row}>
      {categories.map((c) => (
        <Chip
          key={c.id}
          label={c.name}
          active={single ? selected === c.id : selectedIds.includes(c.id)}
          onPress={() => onToggle(c.id)}
          testID={`${testIDPrefix}-${c.id}`}
          accessibilityLabel={`Category ${c.name}`}
        />
      ))}
      {single ? (
        <Chip
          label={UNCATEGORIZED_LABEL}
          active={selected === undefined}
          onPress={() => onToggle(undefined)}
          testID={`${testIDPrefix}-none`}
          accessibilityLabel={`Category ${UNCATEGORIZED_LABEL}`}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
