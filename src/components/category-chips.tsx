import { StyleSheet, View } from 'react-native';

import { Chip } from '@/components/chip';
import type { Category } from '@/types/recipe';

/** Multi-select category chips (spec #3). */
export function CategoryChips({
  categories,
  selectedIds,
  onToggle,
  testIDPrefix = 'category',
}: {
  categories: Category[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  testIDPrefix?: string;
}) {
  return (
    <View style={styles.row}>
      {categories.map((c) => (
        <Chip
          key={c.id}
          label={c.name}
          active={selectedIds.includes(c.id)}
          onPress={() => onToggle(c.id)}
          testID={`${testIDPrefix}-${c.id}`}
          accessibilityLabel={`Category ${c.name}`}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
