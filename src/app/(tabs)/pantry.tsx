import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { FeatureLocked } from '@/components/feature-gate';
import { MAX_CONTENT_WIDTH, MaxWidthContainer, TwoPaneLayout } from '@/components/layout';
import { useFeature, useFeatureVisible } from '@/hooks/use-feature';
import { useWindowSizeClass } from '@/hooks/use-window-size-class';
import { PANTRY_CATEGORIES, expiryState, rankRecipesByPantry } from '@/lib/pantry';
import { colors } from '@/lib/theme';
import { pantryStore } from '@/storage/pantry';
import { recipeStore } from '@/storage/recipes';
import type { PantryItem, Recipe } from '@/types/recipe';

interface Draft {
  id?: string;
  name: string;
  quantity: string;
  unit: string;
  category: string;
  expiresAt: string;
}

const EMPTY_DRAFT: Draft = { name: '', quantity: '', unit: '', category: '', expiresAt: '' };

function formatQty(quantity: number | undefined, unit: string | undefined): string {
  if (quantity === undefined) return unit ? `some ${unit}` : 'on hand';
  const qty = Number.isInteger(quantity) ? String(quantity) : String(Math.round(quantity * 100) / 100);
  return unit ? `${qty} ${unit}` : qty;
}

/**
 * Pantry tab (spec #21). Optional: hidden with Settings → Pantry, and gated with the pantry feature.
 * Compact: on-hand list, with a switch to recipe suggestions. Medium/expanded: list beside suggestions.
 */
export default function PantryScreen() {
  const gate = useFeature('pantry');
  const visible = useFeatureVisible('pantry');
  const showBarcode = useFeatureVisible('barcodeScan');
  const showReceipt = useFeatureVisible('receiptScan');
  const { isTwoPane } = useWindowSizeClass();
  const [items, setItems] = useState<PantryItem[] | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [pane, setPane] = useState<'items' | 'ideas'>('items');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    await recipeStore.seedIfNeeded();
    const [pantry, recs] = await Promise.all([pantryStore.list(), recipeStore.list()]);
    setItems(pantry);
    setRecipes(recs);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

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

  const matches = rankRecipesByPantry(recipes, items).filter((match) => match.have > 0);

  const ideas = (
    <ScrollView contentContainerStyle={styles.ideas} testID="pantry-suggestions">
      <Text style={styles.heading}>What can I cook</Text>
      {items.length === 0 ? (
        <Text style={styles.muted}>Add what you have on hand to see recipes you can cook.</Text>
      ) : matches.length === 0 ? (
        <Text style={styles.muted}>No recipes use what’s on hand yet.</Text>
      ) : (
        matches.map((match) => (
          <Pressable
            key={match.recipe.id}
            accessibilityRole="button"
            style={styles.card}
            testID={`pantry-suggestion-${match.recipe.id}`}
            onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: match.recipe.id } })}>
            <Text style={styles.itemName}>{match.recipe.title}</Text>
            <Text style={styles.muted}>
              {match.have} of {match.total} on hand
              {match.missing.length > 0 ? ` · missing ${match.missing.slice(0, 3).join(', ')}` : ''}
            </Text>
          </Pressable>
        ))
      )}
    </ScrollView>
  );

  const list = (
    <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled" testID="pantry-list">
      <View style={styles.actions}>
        {showBarcode ? (
          <Pressable
            accessibilityRole="button"
            style={styles.secondaryBtn}
            testID="scan-barcode-button"
            onPress={() => router.push('/pantry/scan')}>
            <Text style={styles.secondaryBtnText}>Scan barcode</Text>
          </Pressable>
        ) : null}
        {showReceipt ? (
          <Pressable
            accessibilityRole="button"
            style={styles.secondaryBtn}
            testID="scan-receipt-button"
            onPress={() => router.push('/pantry/receipt')}>
            <Text style={styles.secondaryBtnText}>Scan receipt</Text>
          </Pressable>
        ) : null}
      </View>
      {draft ? (
        <View style={styles.form}>
          <Text style={styles.heading}>{draft.id ? 'Edit item' : 'Add item'}</Text>
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
            testID="pantry-category-input"
            style={styles.input}
            value={draft.category}
            onChangeText={(category) => setDraft({ ...draft, category })}
            placeholder="Category (optional)"
            placeholderTextColor={colors.placeholder}
          />
          <View style={styles.chips}>
            {PANTRY_CATEGORIES.map((category) => (
              <Pressable
                key={category}
                accessibilityRole="button"
                style={[styles.chip, draft.category === category && styles.chipOn]}
                onPress={() => setDraft({ ...draft, category })}>
                <Text style={[styles.chipText, draft.category === category && styles.chipTextOn]}>{category}</Text>
              </Pressable>
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
          {error ? (
            <Text style={styles.error} testID="pantry-form-error">
              {error}
            </Text>
          ) : null}
          <View style={styles.row}>
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
      {items.map((item) => {
        const expiry = expiryState(item.expiresAt);
        return (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            style={styles.card}
            testID={`pantry-item-${item.id}`}
            onPress={() => {
              setError('');
              setDraft({
                id: item.id,
                name: item.name,
                quantity: item.quantity === undefined ? '' : String(item.quantity),
                unit: item.unit ?? '',
                category: item.category ?? '',
                expiresAt: item.expiresAt ?? '',
              });
              setPane('items');
            }}>
            <Text style={styles.itemName}>{item.name}</Text>
            <Text style={styles.muted}>
              {formatQty(item.quantity, item.unit)}
              {item.category ? ` · ${item.category}` : ''}
            </Text>
            {item.expiresAt ? (
              <Text style={expiry === 'expired' ? styles.error : styles.expiry}>
                {expiry === 'expired' ? 'Expired' : expiry === 'soon' ? 'Expires soon' : 'Expires'} {item.expiresAt}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );

  const showItems = isTwoPane || pane === 'items';

  return (
    <TwoPaneLayout
      testID="pantry-layout"
      primary={
        <MaxWidthContainer maxWidth={MAX_CONTENT_WIDTH.list}>
          <View style={styles.fill}>
            {!isTwoPane ? (
              <View style={styles.segment}>
                <Pressable
                  accessibilityRole="button"
                  testID="pantry-show-items"
                  style={[styles.segmentBtn, pane === 'items' && styles.segmentOn]}
                  onPress={() => setPane('items')}>
                  <Text style={pane === 'items' ? styles.segmentTextOn : styles.segmentText}>On hand</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  testID="pantry-show-ideas"
                  style={[styles.segmentBtn, pane === 'ideas' && styles.segmentOn]}
                  onPress={() => setPane('ideas')}>
                  <Text style={pane === 'ideas' ? styles.segmentTextOn : styles.segmentText}>What can I cook</Text>
                </Pressable>
              </View>
            ) : null}
            {showItems ? list : ideas}
          </View>
        </MaxWidthContainer>
      }
      secondary={
        <MaxWidthContainer maxWidth={MAX_CONTENT_WIDTH.text}>
          {ideas}
        </MaxWidthContainer>
      }
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.background },
  list: { padding: 16, gap: 10, paddingBottom: 32 },
  ideas: { padding: 16, gap: 10 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, minHeight: 36, justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.muted, fontSize: 13 },
  chipTextOn: { color: colors.primaryText, fontWeight: '600' },
  card: { backgroundColor: colors.card, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: colors.border, minHeight: 44 },
  itemName: { color: colors.text, fontSize: 16, fontWeight: '600' },
  muted: { color: colors.muted, marginTop: 2 },
  expiry: { color: colors.primary, marginTop: 2 },
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
  segment: { flexDirection: 'row', gap: 8, padding: 12, paddingBottom: 0 },
  segmentBtn: { flex: 1, minHeight: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  segmentOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  segmentText: { color: colors.muted, fontWeight: '600' },
  segmentTextOn: { color: colors.primaryText, fontWeight: '700' },
});
