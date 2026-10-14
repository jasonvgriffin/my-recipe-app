import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { Chip } from '@/components/chip';
import { FeatureLocked } from '@/components/feature-gate';
import { KeyboardAwareScrollView, MAX_CONTENT_WIDTH, MaxWidthContainer, useBottomInset } from '@/components/layout';
import { useFeature, useFeatureVisible } from '@/hooks/use-feature';
import { useOnDataChange } from '@/hooks/use-on-data-change';
import { formatQuantity } from '@/lib/ingredients';
import { PANTRY_CATEGORIES, filterSortPantry, pantryCategories, type PantrySort } from '@/lib/pantry';
import { makeStyles, useColors } from '@/hooks/use-theme';
import { pantryStore } from '@/storage/pantry';
import type { PantryItem } from '@/types/recipe';

interface Draft {
  id?: string;
  name: string;
  quantity: string;
  unit: string;
  category: string;
  expiresAt: string;
  brand: string;
  notes: string;
  description: string;
}

const EMPTY_DRAFT: Draft = { name: '', quantity: '', unit: '', category: '', expiresAt: '', brand: '', notes: '', description: '' };

function draftFor(item: PantryItem): Draft {
  return {
    id: item.id,
    name: item.name,
    quantity: item.quantity === undefined ? '' : String(item.quantity),
    unit: item.unit ?? '',
    category: item.category ?? '',
    expiresAt: item.expiresAt ?? '',
    brand: item.brand ?? '',
    notes: item.notes ?? '',
    description: item.description ?? '',
  };
}

/**
 * Pantry tab (spec #21). Optional: hidden with Settings → Pantry, and gated with the pantry feature.
 * One list of what's on hand. "What can I make?" lives on the Recipes tab (v1.0.1; `src/app/pantry-match.tsx`).
 */
export default function PantryScreen() {
  const bottomInset = useBottomInset();
  const styles = useStyles();
  const colors = useColors();
  const gate = useFeature('pantry');
  const visible = useFeatureVisible('pantry');
  const [items, setItems] = useState<PantryItem[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>();
  const [sort, setSort] = useState<PantrySort>('name');

  const reload = useCallback(async () => {
    setItems(await pantryStore.list());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );
  // Reload when data changes elsewhere (e.g. a Backup & restore).
  useOnDataChange(() => {
    void reload().catch(() => undefined);
  });

  if (!gate.available) return <FeatureLocked id="pantry" />;
  if (!visible) {
    return (
      <View style={styles.center} testID="pantry-hidden">
        <Text style={styles.muted}>Pantry is turned off in Settings.</Text>
      </View>
    );
  }
  if (!items) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  async function save() {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) {
      setError('Name is required.');
      return;
    }
    const quantityText = draft.quantity.trim();
    let quantity: number | undefined;
    if (quantityText !== '') {
      quantity = Number(quantityText);
      if (!Number.isFinite(quantity) || quantity < 0) {
        setError('Quantity must be a number of 0 or more.');
        return;
      }
    }
    const expiresAt = draft.expiresAt.trim();
    if (expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) {
      setError('Expiry must be YYYY-MM-DD.');
      return;
    }
    setError('');
    try {
      await pantryStore.saveDetails({
        id: draft.id,
        name,
        quantity,
        unit: draft.unit,
        category: draft.category,
        expiresAt,
        brand: draft.brand,
        notes: draft.notes,
        description: draft.description,
      });
      setDraft(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    }
  }

  async function remove(id: string) {
    await pantryStore.remove(id);
    if (draft?.id === id) setDraft(null);
    await reload();
  }

  const usedCategories = pantryCategories(items);
  const activeFilter = categoryFilter && usedCategories.includes(categoryFilter) ? categoryFilter : undefined;
  const shownItems = filterSortPantry(items, { category: activeFilter, sort });

  const list = (
    <KeyboardAwareScrollView contentContainerStyle={[styles.list, { paddingBottom: 48 + bottomInset }]} testID="pantry-list">
      {draft ? (
        <View style={styles.form}>
          <Text style={styles.heading} testID="pantry-form-heading">
            {draft.id ? 'Edit item' : 'Add item'}
          </Text>
          <TextInput
            testID="pantry-name-input"
            style={styles.input}
            value={draft.name}
            onChangeText={(name) => setDraft({ ...draft, name })}
            placeholder="e.g. chicken breast"
            placeholderTextColor={colors.placeholder}
            autoCapitalize="none"
          />
          <View style={styles.row}>
            <TextInput
              testID="pantry-quantity-input"
              style={[styles.input, styles.flex]}
              value={draft.quantity}
              onChangeText={(quantity) => setDraft({ ...draft, quantity })}
              placeholder="Qty (optional)"
              placeholderTextColor={colors.placeholder}
              keyboardType="decimal-pad"
            />
            <TextInput
              testID="pantry-unit-input"
              style={[styles.input, styles.flex]}
              value={draft.unit}
              onChangeText={(unit) => setDraft({ ...draft, unit })}
              placeholder="Unit"
              placeholderTextColor={colors.placeholder}
              autoCapitalize="none"
            />
          </View>
          <TextInput
            testID="pantry-brand-input"
            style={styles.input}
            value={draft.brand}
            onChangeText={(brand) => setDraft({ ...draft, brand })}
            placeholder="Brand (optional)"
            placeholderTextColor={colors.placeholder}
          />
          <TextInput
            testID="pantry-category-input"
            style={styles.input}
            value={draft.category}
            onChangeText={(category) => setDraft({ ...draft, category })}
            placeholder="Category (optional)"
            placeholderTextColor={colors.placeholder}
          />
          <View style={styles.chips}>
            {PANTRY_CATEGORIES.map((category) => (
              <Chip
                key={category}
                label={category}
                active={draft.category === category}
                onPress={() => setDraft({ ...draft, category: draft.category === category ? '' : category })}
              />
            ))}
          </View>
          <TextInput
            testID="pantry-expiry-input"
            style={styles.input}
            value={draft.expiresAt}
            onChangeText={(expiresAt) => setDraft({ ...draft, expiresAt })}
            placeholder="Expiry YYYY-MM-DD (optional)"
            placeholderTextColor={colors.placeholder}
            autoCapitalize="none"
          />
          <TextInput
            testID="pantry-notes-input"
            style={[styles.input, styles.notes]}
            value={draft.notes}
            onChangeText={(notes) => setDraft({ ...draft, notes })}
            placeholder="Notes (optional)"
            placeholderTextColor={colors.placeholder}
            accessibilityLabel="Notes (optional)"
            multiline
            scrollEnabled
          />
          {error ? (
            <Text style={styles.error} testID="pantry-form-error">
              {error}
            </Text>
          ) : null}
          <View style={[styles.row, styles.wrap]} testID="pantry-form-actions">
            <Pressable accessibilityRole="button" style={styles.primaryBtn} testID="pantry-save-button" onPress={() => void save()}>
              <Text style={styles.primaryBtnText}>Save</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={styles.secondaryBtn}
              onPress={() => {
                setDraft(null);
                setError('');
              }}>
              <Text style={styles.secondaryBtnText}>Cancel</Text>
            </Pressable>
            {draft.id ? (
              <Pressable
                accessibilityRole="button"
                style={styles.dangerBtn}
                testID="pantry-remove-button"
                onPress={() => void remove(draft.id!)}>
                <Text style={styles.dangerBtnText}>Remove</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          style={styles.primaryBtn}
          testID="pantry-add-button"
          onPress={() => {
            setError('');
            setDraft(EMPTY_DRAFT);
          }}>
          <Text style={styles.primaryBtnText}>Add item</Text>
        </Pressable>
      )}
      {items.length === 0 ? <Text style={styles.muted}>Nothing in the pantry yet.</Text> : null}
      {items.length > 0 ? (
        <View style={styles.chips} testID="pantry-list-controls">
          <Chip label="All" active={!activeFilter} onPress={() => setCategoryFilter(undefined)} testID="pantry-filter-all" />
          {usedCategories.map((category) => (
            <Chip
              key={category}
              label={category}
              active={activeFilter === category}
              onPress={() => setCategoryFilter(activeFilter === category ? undefined : category)}
              testID={`pantry-filter-${category}`}
            />
          ))}
          <Chip
            label={sort === 'expiry' ? 'Sort: expiring first' : 'Sort: name'}
            active={sort === 'expiry'}
            onPress={() => setSort(sort === 'expiry' ? 'name' : 'expiry')}
            testID="pantry-sort"
          />
        </View>
      ) : null}
      {shownItems.map((item) => {
        const quantityLabel =
          typeof item.quantity === 'number' && Number.isFinite(item.quantity)
            ? `Quantity: ${formatQuantity(item.quantity)}`
            : null;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            style={styles.card}
            testID={`pantry-item-${item.id}`}
            onPress={() => {
              setError('');
              setDraft(draftFor(item));
            }}>
            <Text style={styles.itemName}>{item.name}</Text>
            {quantityLabel ? <Text style={styles.itemQuantity}>{quantityLabel}</Text> : null}
          </Pressable>
        );
      })}
    </KeyboardAwareScrollView>
  );

  return (
    <View style={styles.fill} testID="pantry-layout">
      <MaxWidthContainer maxWidth={MAX_CONTENT_WIDTH.list}>{list}</MaxWidthContainer>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.background },
  list: { padding: 16, gap: 10, paddingBottom: 32 },
  form: { gap: 8, backgroundColor: colors.card, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border },
  heading: { color: colors.text, fontSize: 18, fontWeight: '700' },
  input: {
    backgroundColor: colors.input,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
  },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  flex: { flex: 1, minWidth: 0 },
  wrap: { flexWrap: 'wrap' },
  notes: { height: 192, minHeight: 192, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemName: { color: colors.text, fontSize: 16, fontWeight: '600', flexGrow: 1, flexShrink: 1, minWidth: 0 },
  itemQuantity: { color: colors.text, fontSize: 16, fontWeight: '600', flexGrow: 0, flexShrink: 0 },
  muted: { color: colors.muted, marginTop: 2 },
  error: { color: colors.danger, marginTop: 2 },
  primaryBtn: {
    backgroundColor: colors.primary,
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: colors.primaryText, fontWeight: '700' },
  secondaryBtn: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  secondaryBtnText: { color: colors.text, fontWeight: '600' },
  dangerBtn: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.danger,
  },
  dangerBtnText: { color: colors.background, fontWeight: '700' },
}));
