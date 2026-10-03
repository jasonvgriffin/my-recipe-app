import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';

import { groupByAisle, shoppingProgress } from '@/lib/shopping';
import { colors } from '@/lib/theme';
import type { ShoppingListItem } from '@/types/meal-plan';

export interface GroceryRunViewProps {
  items: ShoppingListItem[];
  canUndo: boolean;
  onToggle: (item: ShoppingListItem) => void;
  onUndo: () => void;
}

/**
 * Focused buy list (spec #18): aisle groups, large targets, progress, undo.
 * The screen keeps the display awake and owns persistence.
 */
export function GroceryRunView({ items, canUndo, onToggle, onUndo }: GroceryRunViewProps) {
  const progress = shoppingProgress(items);
  const percent = Math.round(progress.fraction * 100);
  const sections = groupByAisle(items).map((group) => ({
    title: group.aisle,
    data: group.items,
    remaining: group.items.filter((i) => !i.checked).length,
  }));

  const header = (
    <View style={styles.header}>
      <Text
        style={styles.progress}
        accessibilityRole="text"
        accessibilityLabel={`${progress.checked} of ${progress.total} items checked`}
        testID="grocery-progress">
        {progress.total === 0 ? 'Nothing to buy' : `${progress.checked} of ${progress.total}`}
      </Text>
      <View style={styles.track} accessibilityElementsHidden>
        <View style={[styles.fill, { width: `${percent}%` }]} />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !canUndo }}
        disabled={!canUndo}
        onPress={onUndo}
        style={[styles.undo, !canUndo && styles.undoOff]}
        testID="grocery-undo">
        <Text style={[styles.undoText, !canUndo && styles.undoTextOff]}>Undo</Text>
      </Pressable>
      {progress.total > 0 && progress.checked === progress.total ? (
        <Text style={styles.done}>All items checked.</Text>
      ) : null}
    </View>
  );

  return (
    <SectionList
      style={styles.list}
      contentContainerStyle={styles.content}
      sections={sections}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={header}
      ListEmptyComponent={<Text style={styles.empty}>Nothing to buy.</Text>}
      stickySectionHeadersEnabled={false}
      renderSectionHeader={({ section }) => (
        <Text style={styles.aisle} accessibilityRole="header" testID={`grocery-aisle-${section.title}`}>
          {section.title}
          {section.remaining > 0 ? ` · ${section.remaining} left` : ''}
        </Text>
      )}
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: item.checked }}
          accessibilityLabel={item.text}
          onPress={() => onToggle(item)}
          style={styles.row}
          testID={`grocery-item-${item.id}`}>
          <View style={[styles.box, item.checked && styles.boxOn]}>
            {item.checked ? <Text style={styles.mark}>✓</Text> : null}
          </View>
          <Text style={[styles.itemText, item.checked && styles.itemChecked]}>{item.text}</Text>
        </Pressable>
      )}
    />
  );
}

/** Aisle counts for the expanded secondary pane. */
export function GroceryAisleSummary({ items }: { items: ShoppingListItem[] }) {
  const groups = groupByAisle(items);
  return (
    <View style={styles.summary} testID="grocery-summary">
      <Text style={styles.summaryTitle}>By aisle</Text>
      {groups.length === 0 ? <Text style={styles.empty}>No aisles yet.</Text> : null}
      {groups.map((group) => {
        const left = group.items.filter((i) => !i.checked).length;
        return (
          <Text key={group.aisle} style={styles.summaryRow}>
            {group.aisle} · {left} left
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  content: { padding: 16, paddingBottom: 48 },
  header: { gap: 10, marginBottom: 8 },
  progress: { color: colors.text, fontSize: 28, fontWeight: '800' },
  track: { height: 10, borderRadius: 5, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: 10, backgroundColor: colors.primary },
  undo: {
    minHeight: 56,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  undoOff: { borderColor: colors.border },
  undoText: { color: colors.primary, fontSize: 18, fontWeight: '800' },
  undoTextOff: { color: colors.placeholder },
  done: { color: colors.primary, fontWeight: '700' },
  aisle: { color: colors.muted, fontWeight: '800', marginTop: 16, marginBottom: 8, fontSize: 14 },
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  box: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.primary },
  mark: { color: colors.primaryText, fontWeight: '800', fontSize: 18 },
  itemText: { color: colors.text, fontSize: 20, flex: 1, fontWeight: '600' },
  itemChecked: { color: colors.muted, textDecorationLine: 'line-through' },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 24 },
  summary: { padding: 16, gap: 8 },
  summaryTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  summaryRow: { color: colors.text, fontSize: 16 },
});
