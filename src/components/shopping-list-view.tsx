import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { useBottomInset } from '@/components/layout';
import { formatShortDate } from '@/lib/dates';
import { makeStyles, useColors } from '@/hooks/use-theme';
import type { IsoDate, ShoppingList } from '@/types/meal-plan';

/** Placeholder of the add-item box (v1.0.5, Jason's exact wording). */
export const SHOPPING_ADD_PLACEHOLDER = 'Type here & press Add';

export interface ShoppingListViewProps {
  weekStart: IsoDate;
  mealCount: number;
  list: ShoppingList | undefined;
  manualText: string;
  onManualText: (text: string) => void;
  showGroceryRun: boolean;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onBuild: () => void;
  onToggle: (id: string) => void;
  onAddManual: () => void;
  onClearChecked: () => void;
  onGroceryRun: () => void;
  /**
   * Barcode scan entry point (shown when barcodeScan is visible): a full-width outlined “Scan Item” button, the
   * first one under “or” (below the type-and-Add row, v1.0.5). The scanner adds the product name.
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
  return (
    <View style={styles.fill}>
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
      {added ? (
        <Text style={styles.added} testID="shopping-added-banner">
          Added {added}
        </Text>
      ) : null}
      <Text style={styles.or} testID="shopping-scan-or">
        or
      </Text>
      {onScan ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Scan Item"
          accessibilityHint="Scan a barcode to add the product to this list"
          onPress={onScan}
          style={styles.secondary}
          testID="shopping-scan-button">
          <Text style={styles.secondaryText}>Scan Item</Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityHint={
          list ? 'Rebuilds this week’s list from your meal plan, keeping items you added' : 'Builds this week’s list from your meal plan'
        }
        onPress={onBuild}
        style={styles.secondary}
        testID="build-list">
        <Text style={styles.secondaryText}>Build from Meal Plan</Text>
      </Pressable>
      {showGroceryRun ? (
        <Pressable accessibilityRole="button" onPress={onGroceryRun} style={styles.primary} testID="grocery-run-button">
          <Text style={styles.primaryText}>View Shopping List</Text>
        </Pressable>
      ) : null}
      {checked ? (
        <Pressable accessibilityRole="button" onPress={onClearChecked} style={styles.clear} testID="clear-checked">
          <Text style={styles.clearText}>Clear checked</Text>
        </Pressable>
      ) : null}
      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: 12 + bottomInset }]} keyboardShouldPersistTaps="handled">
        {(list?.items.length ?? 0) === 0 ? (
          <Text style={styles.empty}>
            {list ? 'No ingredients — plan some recipes for this week first.' : 'No list yet for this week.'}
          </Text>
        ) : null}
        {list?.items.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: item.checked }}
            onPress={() => onToggle(item.id)}
            style={styles.item}
            testID={`shop-item-${item.id}`}>
            <Text style={styles.check}>{item.checked ? '☑' : '☐'}</Text>
            <View style={styles.itemBody}>
              <Text style={[styles.itemText, item.checked && styles.checked]}>{item.text}</Text>
              {item.recipeIds.length === 0 ? <Text style={styles.manual}>Added by you</Text> : null}
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  added: { color: colors.primary, fontWeight: '700', fontSize: 16, marginTop: 8 },
  fill: { flex: 1, padding: 12 },
  nav: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  navBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  navText: { color: colors.primary, fontSize: 28, fontWeight: '600' },
  navLabel: { flex: 1, alignItems: 'center' },
  week: { color: colors.text, fontWeight: '700', fontSize: 16 },
  meta: { color: colors.muted, fontSize: 13 },
  primary: {
    minHeight: 44,
    marginTop: 8,
    backgroundColor: colors.primary,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  primaryText: { color: colors.primaryText, fontWeight: '700' },
  secondary: {
    minHeight: 44,
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: colors.primary, fontWeight: '700' },
  or: { color: colors.muted, textAlign: 'center', marginTop: 8 },
  manualRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
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
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: { color: colors.text, fontWeight: '700' },
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
  check: { color: colors.primary, fontSize: 20 },
  itemBody: { flex: 1 },
  itemText: { color: colors.text, fontSize: 16 },
  checked: { color: colors.muted, textDecorationLine: 'line-through' },
  manual: { color: colors.muted, fontSize: 12, marginTop: 2 },
}));
