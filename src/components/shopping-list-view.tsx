import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { ItemNotesSheet, SeeNotesLink } from '@/components/grocery-run-view';
import { KeyboardAwareFlatList, useBottomInset } from '@/components/layout';
import { formatShortDate } from '@/lib/dates';
import { makeStyles, useColors } from '@/hooks/use-theme';
import type { IsoDate, ShoppingList, ShoppingListItem } from '@/types/meal-plan';

/** Placeholder of the add-item box (v1.0.5, Jason's exact wording). */
export const SHOPPING_ADD_PLACEHOLDER = 'Type here & press Add';
/** v1.0.7 optional fields (plain labels, no example text). */
export const SHOPPING_QTY_PLACEHOLDER = 'Quantity';
export const SHOPPING_NOTES_PLACEHOLDER = 'Notes';

export interface ShoppingItemEdit {
  text: string;
  quantity: string;
  notes: string;
}

export interface ShoppingListViewProps {
  weekStart: IsoDate;
  mealCount: number;
  list: ShoppingList | undefined;
  manualText: string;
  onManualText: (text: string) => void;
  /** v1.0.7: optional quantity / notes for the item being added. */
  manualQuantity: string;
  onManualQuantity: (text: string) => void;
  manualNotes: string;
  onManualNotes: (text: string) => void;
  /** v1.0.7: save an edited line (quantity / notes; text for lines you added). */
  onEditItem: (id: string, edit: ShoppingItemEdit) => void;
  showGroceryRun: boolean;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onBuild: () => void;
  onToggle: (id: string) => void;
  onAddManual: () => void;
  onClearChecked: () => void;
  onGroceryRun: () => void;
  /**
   * Barcode scan entry point (shown when barcodeScan is visible): a full-width filled “Scan Item” button, the
   * first one under “or” (below the type-and-Add row). The scanner adds the product name.
   */
  onScan?: () => void;
  /** Product name just added by a scan, confirmed at the top. */
  added?: string;
}

/** Shopping list for one chosen week (spec #12). The parent owns persistence. */
export function ShoppingListView({
  weekStart,
  mealCount,
  list,
  manualText,
  onManualText,
  manualQuantity,
  onManualQuantity,
  manualNotes,
  onManualNotes,
  onEditItem,
  showGroceryRun,
  onPrevWeek,
  onNextWeek,
  onBuild,
  onToggle,
  onAddManual,
  onClearChecked,
  onGroceryRun,
  onScan,
  added,
}: ShoppingListViewProps) {
  const bottomInset = useBottomInset();
  const styles = useStyles();
  const colors = useColors();
  const checked = list?.items.some((i) => i.checked) ?? false;
  const [editing, setEditing] = useState<{ id: string } & ShoppingItemEdit | null>(null);
  const [notesFor, setNotesFor] = useState<ShoppingListItem | null>(null);

  function startEdit(item: ShoppingListItem) {
    setEditing({ id: item.id, text: item.text, quantity: item.quantity ?? '', notes: item.notes ?? '' });
  }

  function saveEdit() {
    if (!editing) return;
    const { id, ...edit } = editing;
    onEditItem(id, edit);
    setEditing(null);
  }
  const header = (
    <>
      <View style={styles.nav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous week"
          onPress={onPrevWeek}
          style={styles.navBtn}
          testID="week-prev">
          <Text style={styles.navText}>‹</Text>
        </Pressable>
        <View style={styles.navLabel}>
          <Text style={styles.week} testID="week-label">
            Week of {formatShortDate(weekStart)}
          </Text>
          <Text style={styles.meta}>
            {mealCount} meal{mealCount === 1 ? '' : 's'} this week
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next week"
          onPress={onNextWeek}
          style={styles.navBtn}
          testID="week-next">
          <Text style={styles.navText}>›</Text>
        </Pressable>
      </View>
      {/* v1.0.5 (Jason): type-and-Add first, then “or”, then Scan Item / Build from Meal Plan / View Shopping List. */}
      <View style={styles.manualRow}>
        <TextInput
          value={manualText}
          onChangeText={onManualText}
          placeholder={SHOPPING_ADD_PLACEHOLDER}
          placeholderTextColor={colors.placeholder}
          style={styles.input}
          accessibilityLabel="Add an item to the shopping list"
          testID="manual-input"
          onSubmitEditing={onAddManual}
          returnKeyType="done"
        />
        <Pressable accessibilityRole="button" onPress={onAddManual} style={styles.addBtn} testID="add-manual">
          <Text style={styles.addBtnText}>Add</Text>
        </Pressable>
      </View>
      <View style={styles.detailsRow}>
        <TextInput
          value={manualQuantity}
          onChangeText={onManualQuantity}
          placeholder={SHOPPING_QTY_PLACEHOLDER}
          placeholderTextColor={colors.placeholder}
          style={[styles.input, styles.qtyInput]}
          accessibilityLabel="Quantity"
          testID="manual-quantity"
          returnKeyType="next"
        />
        <TextInput
          value={manualNotes}
          onChangeText={onManualNotes}
          placeholder={SHOPPING_NOTES_PLACEHOLDER}
          placeholderTextColor={colors.placeholder}
          style={styles.input}
          accessibilityLabel="Notes"
          testID="manual-notes"
          onSubmitEditing={onAddManual}
          returnKeyType="done"
        />
      </View>
      {added ? (
        <Text style={styles.added} testID="shopping-added-banner">
          Added {added}
        </Text>
      ) : null}
      <Text style={styles.or} testID="shopping-scan-or">
        or
      </Text>
      <View style={styles.actions} testID="shopping-actions">
        {onScan ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Scan Item"
            accessibilityHint="Scan a barcode to add the product to this list"
            onPress={onScan}
            style={styles.primary}
            testID="shopping-scan-button">
            <Text style={styles.primaryText}>Scan Item</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityHint={
            list ? 'Rebuilds this week’s list from your meal plan, keeping items you added' : 'Builds this week’s list from your meal plan'
          }
          onPress={onBuild}
          style={styles.primary}
          testID="build-list">
          <Text style={styles.primaryText}>Build from Meal Plan</Text>
        </Pressable>
        {showGroceryRun ? (
          <Pressable accessibilityRole="button" onPress={onGroceryRun} style={styles.primary} testID="grocery-run-button">
            <Text style={styles.primaryText}>View Shopping List</Text>
          </Pressable>
        ) : null}
      </View>
      {checked ? (
        <Pressable accessibilityRole="button" onPress={onClearChecked} style={styles.clear} testID="clear-checked">
          <Text style={styles.clearText}>Clear checked</Text>
        </Pressable>
      ) : null}
    </>
  );

  return (
    <View style={styles.fill}>
      <KeyboardAwareFlatList
        style={styles.scroller}
        data={list?.items ?? []}
        keyExtractor={(item) => item.id}
        extraData={editing?.id ?? notesFor?.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.list, { paddingBottom: 12 + bottomInset }]}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {list ? 'No ingredients — plan some recipes for this week first.' : 'No list yet for this week.'}
          </Text>
        }
        testID="shopping-list"
        renderItem={({ item }) =>
          editing?.id === item.id ? (
            <View style={[styles.item, styles.editBox]} testID={`shop-edit-${item.id}`}>
              {item.recipeIds.length === 0 ? (
                <TextInput
                  value={editing.text}
                  onChangeText={(text) => setEditing({ ...editing, text })}
                  placeholder="Item"
                  placeholderTextColor={colors.placeholder}
                  style={styles.input}
                  accessibilityLabel="Item"
                  testID="shop-edit-text"
                />
              ) : (
                <Text style={styles.itemText}>{item.text}</Text>
              )}
              <TextInput
                value={editing.quantity}
                onChangeText={(quantity) => setEditing({ ...editing, quantity })}
                placeholder={SHOPPING_QTY_PLACEHOLDER}
                placeholderTextColor={colors.placeholder}
                style={styles.input}
                accessibilityLabel="Quantity"
                testID="shop-edit-quantity"
              />
              <TextInput
                value={editing.notes}
                onChangeText={(notes) => setEditing({ ...editing, notes })}
                placeholder={SHOPPING_NOTES_PLACEHOLDER}
                placeholderTextColor={colors.placeholder}
                style={styles.input}
                accessibilityLabel="Notes"
                testID="shop-edit-notes"
                multiline
              />
              <View style={styles.editActions}>
                <Pressable accessibilityRole="button" onPress={() => setEditing(null)} style={styles.editCancel} testID="shop-edit-cancel">
                  <Text style={styles.secondaryText}>Cancel</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={saveEdit} style={styles.editSave} testID="shop-edit-save">
                  <Text style={styles.primaryText}>Save</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.item}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: item.checked }}
                accessibilityLabel={item.text}
                onPress={() => onToggle(item.id)}
                hitSlop={8}
                style={styles.checkHit}
                testID={`shop-item-${item.id}`}>
                <Text style={styles.check}>{item.checked ? '☑' : '☐'}</Text>
              </Pressable>
              <View style={styles.itemBody}>
                <Text style={[styles.itemText, item.checked && styles.checked]}>{item.text}</Text>
                {item.quantity ? (
                  <Text style={styles.detail} testID={`shop-item-qty-${item.id}`}>
                    Qty: {item.quantity}
                  </Text>
                ) : null}
                {item.notes ? (
                  <SeeNotesLink
                    label={`See notes for ${item.text}`}
                    onPress={() => setNotesFor(item)}
                    testID={`shop-item-notes-${item.id}`}
                  />
                ) : null}
                {item.recipeIds.length === 0 ? <Text style={styles.manual}>Added by you</Text> : null}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Edit ${item.text}`}
                onPress={() => startEdit(item)}
                style={styles.editBtn}
                testID={`shop-item-edit-${item.id}`}>
                <Ionicons name="create-outline" size={22} color={colors.primary} />
              </Pressable>
            </View>
          )
        }
      />
      <ItemNotesSheet item={notesFor} onClose={() => setNotesFor(null)} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  added: { color: colors.primary, fontWeight: '700', fontSize: 16, marginTop: 8 },
  fill: { flex: 1, padding: 12 },
  scroller: { flex: 1 },
  nav: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  navBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  navText: { color: colors.primary, fontSize: 28, fontWeight: '600' },
  navLabel: { flex: 1, alignItems: 'center' },
  week: { color: colors.text, fontWeight: '700', fontSize: 16 },
  meta: { color: colors.muted, fontSize: 13 },
  actions: { width: '78%', maxWidth: 420, alignSelf: 'center', gap: 14, marginTop: 4 },
  primary: {
    minHeight: 44,
    backgroundColor: colors.primary,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  primaryText: { color: colors.primaryText, fontWeight: '700' },
  secondaryText: { color: colors.primary, fontWeight: '700' },
  or: { color: colors.muted, textAlign: 'center', marginTop: 8 },
  manualRow: { flexDirection: 'row', gap: 8 },
  detailsRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  qtyInput: { flexGrow: 0, flexBasis: 150, flexShrink: 0, width: 150, minWidth: 0 },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    color: colors.text,
    backgroundColor: colors.input,
  },
  addBtn: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: { color: colors.primaryText, fontWeight: '700' },
  clear: { minHeight: 44, marginTop: 8, alignItems: 'center', justifyContent: 'center' },
  clearText: { color: colors.danger, fontWeight: '700' },
  list: { paddingVertical: 12, gap: 6 },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 32 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    padding: 12,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  checkHit: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  editBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  editBox: { flexDirection: 'column', alignItems: 'stretch', gap: 8 },
  editActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  editCancel: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editSave: {
    minHeight: 44,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detail: { color: colors.muted, fontSize: 14, marginTop: 2 },
  check: { color: colors.primary, fontSize: 20 },
  itemBody: { flex: 1 },
  itemText: { color: colors.text, fontSize: 16 },
  checked: { color: colors.muted, textDecorationLine: 'line-through' },
  manual: { color: colors.muted, fontSize: 12, marginTop: 2 },
}));
