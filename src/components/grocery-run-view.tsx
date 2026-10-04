import { useState } from 'react';
import { Modal, Pressable, SectionList, Text, View } from 'react-native';

import { useBottomInset } from '@/components/layout';
import { groupByAisle, shoppingProgress } from '@/lib/shopping';
import { makeStyles } from '@/hooks/use-theme';
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
  const bottomInset = useBottomInset();
  const styles = useStyles();
  const [notesFor, setNotesFor] = useState<ShoppingListItem | null>(null);
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
    <>
    <SectionList
      style={styles.list}
      contentContainerStyle={[styles.content, { paddingBottom: 48 + bottomInset }]}
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
        <View style={styles.row} testID={`grocery-item-${item.id}`}>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: item.checked }}
            accessibilityLabel={item.text}
            onPress={() => onToggle(item)}
            hitSlop={8}
            style={styles.checkHit}
            testID={`grocery-check-${item.id}`}>
            <View style={[styles.box, item.checked && styles.boxOn]}>
              {item.checked ? <Text style={styles.mark}>✓</Text> : null}
            </View>
          </Pressable>
          <View style={styles.itemBody}>
            <Text style={[styles.itemText, item.checked && styles.itemChecked]}>{item.text}</Text>
            {item.quantity ? <Text style={styles.itemDetail}>Qty: {item.quantity}</Text> : null}
            {item.notes ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`See notes for ${item.text}`}
                onPress={() => setNotesFor(item)}
                hitSlop={6}
                testID={`grocery-notes-${item.id}`}>
                <Text style={styles.seeNotes}>(see notes)</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      )}
    />
      <Modal visible={notesFor != null} transparent animationType="fade" onRequestClose={() => setNotesFor(null)}>
        <Pressable style={styles.backdrop} accessibilityLabel="Close notes" onPress={() => setNotesFor(null)}>
          <Pressable style={styles.notesCard} onPress={() => undefined} testID="grocery-notes-modal">
            <Text style={styles.notesTitle}>{notesFor?.text}</Text>
            <Text style={styles.notesBody}>{notesFor?.notes}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setNotesFor(null)}
              style={styles.notesClose}
              testID="grocery-notes-close">
              <Text style={styles.notesCloseText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

/** Aisle counts for the expanded secondary pane. */
export function GroceryAisleSummary({ items }: { items: ShoppingListItem[] }) {
  const styles = useStyles();
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

const useStyles = makeStyles((colors) => ({
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
  checkHit: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
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
  itemBody: { flex: 1 },
  itemText: { color: colors.text, fontSize: 20, fontWeight: '600' },
  itemDetail: { color: colors.muted, fontSize: 15, marginTop: 2 },
  seeNotes: { color: colors.primary, fontSize: 14, fontWeight: '600', marginTop: 2 },
  backdrop: {
    flex: 1,
    backgroundColor: colors.backdrop,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  notesCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 20,
    gap: 12,
  },
  notesTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  notesBody: { color: colors.text, fontSize: 16, lineHeight: 22 },
  notesClose: {
    alignSelf: 'flex-end',
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notesCloseText: { color: colors.primaryText, fontWeight: '700' },
  itemChecked: { color: colors.muted, textDecorationLine: 'line-through' },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 24 },
  summary: { padding: 16, gap: 8 },
  summaryTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  summaryRow: { color: colors.text, fontSize: 16 },
}));
