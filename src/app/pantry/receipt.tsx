import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import {
  launchCameraAsync,
  launchImageLibraryAsync,
  requestCameraPermissionsAsync,
  requestMediaLibraryPermissionsAsync,
} from 'expo-image-picker';

import { FeatureLocked } from '@/components/feature-gate';
import { TwoPaneLayout } from '@/components/layout';
import { useFeature, useFeatureVisible } from '@/hooks/use-feature';
import { useWindowSizeClass } from '@/hooks/use-window-size-class';
import { colors } from '@/lib/theme';
import { applyReviewedReceipt, buildReceiptReview, type ReviewLine } from '@/receipts';
import { recognizeReceiptText } from '@/receipts/ocr';
import { pantryStore } from '@/storage/pantry';
import { receiptAliasStore } from '@/storage/receipt-aliases';

/**
 * Receipt photo → on-device OCR → review → pantry (spec #26).
 * Camera or gallery. Each line can be edited, skipped, or matched to a pantry item.
 * Correcting a name saves a household alias.
 */
export default function ReceiptScanScreen() {
  const access = useFeature('receiptScan');
  const visible = useFeatureVisible('receiptScan');
  const { isTwoPane } = useWindowSizeClass();
  const [lines, setLines] = useState<ReviewLine[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [permissionMessage, setPermissionMessage] = useState('');
  const [applied, setApplied] = useState('');

  if (!access.available) return <FeatureLocked id="receiptScan" />;
  if (!visible) {
    return (
      <View style={styles.center} testID="receipt-hidden">
        <Text style={styles.muted}>Pantry is turned off in Settings.</Text>
      </View>
    );
  }

  async function pick(source: 'camera' | 'gallery') {
    setError('');
    setPermissionMessage('');
    setApplied('');
    const permission =
      source === 'camera' ? await requestCameraPermissionsAsync() : await requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setPermissionMessage(
        source === 'camera'
          ? 'Camera access is needed to photograph a receipt.'
          : 'Photo library access is needed to choose a receipt.',
      );
      return;
    }
    const picked =
      source === 'camera'
        ? await launchCameraAsync({ mediaTypes: 'images', quality: 0.7 })
        : await launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.7 });
    if (picked.canceled || !picked.assets[0]?.uri) return;
    setWorking(true);
    try {
      const text = await recognizeReceiptText(picked.assets[0].uri);
      if (!text) {
        setLines([]);
        setError('No text found. Try a clearer photo.');
        return;
      }
      const [pantry, aliases] = await Promise.all([pantryStore.list(), receiptAliasStore.list()]);
      const review = buildReceiptReview(text, pantry, aliases);
      setLines(review);
      setSelectedId(review[0]?.id ?? null);
      if (review.length === 0) setError('No grocery items found on this receipt.');
    } catch (e) {
      setLines([]);
      setError(e instanceof Error ? e.message : 'Could not read that photo.');
    } finally {
      setWorking(false);
    }
  }

  function update(id: string, patch: Partial<ReviewLine>) {
    setLines((prev) => prev.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  async function apply() {
    setError('');
    const result = await applyReviewedReceipt(lines, {
      addQuantity: (input) => pantryStore.addQuantity(input),
      rememberAlias: (alias, name) => receiptAliasStore.remember(alias, name),
    });
    if (result.locked) {
      setError('Receipt scanning is not available.');
      return;
    }
    if (result.applied === 0) {
      setError('Nothing to add. Un-skip a line or enter a name.');
      return;
    }
    setApplied(
      `Added ${result.applied} ${result.applied === 1 ? 'item' : 'items'} to the pantry` +
        (result.createdAliases > 0 ? ` and remembered ${result.createdAliases} name${result.createdAliases === 1 ? '' : 's'}.` : '.'),
    );
  }

  const selected = lines.find((line) => line.id === selectedId);

  const editor = selected ? (
    <ScrollView contentContainerStyle={styles.editor} testID="receipt-detail" keyboardShouldPersistTaps="handled">
      <Text style={styles.raw}>{selected.rawText}</Text>
      <Text style={styles.muted} testID="receipt-match">
        {selected.match === 'new' ? 'New pantry item' : `Matches your pantry (${selected.match})`}
      </Text>
      <TextInput
        testID="receipt-name-input"
        style={styles.input}
        value={selected.name}
        onChangeText={(name) => update(selected.id, { name })}
        placeholder="Item name"
        placeholderTextColor={colors.placeholder}
        autoCapitalize="none"
      />
      <View style={styles.row}>
        <TextInput
          testID="receipt-qty-input"
          style={[styles.input, styles.flex]}
          value={String(selected.quantity)}
          onChangeText={(value) => {
            const quantity = Number(value);
            if (Number.isFinite(quantity)) update(selected.id, { quantity });
          }}
          keyboardType="decimal-pad"
          placeholder="Qty"
          placeholderTextColor={colors.placeholder}
        />
        <TextInput
          testID="receipt-unit-input"
          style={[styles.input, styles.flex]}
          value={selected.unit ?? ''}
          onChangeText={(unit) => update(selected.id, { unit: unit.trim() || undefined })}
          placeholder="Unit"
          placeholderTextColor={colors.placeholder}
          autoCapitalize="none"
        />
      </View>
      {selected.price !== undefined ? <Text style={styles.muted}>Price ${selected.price.toFixed(2)}</Text> : null}
      <View style={styles.row}>
        <Text style={styles.body}>Skip</Text>
        <Switch
          testID="receipt-skip"
          value={selected.skipped}
          onValueChange={(skipped) => update(selected.id, { skipped })}
          trackColor={{ true: colors.primary, false: colors.border }}
        />
      </View>
      <Text style={styles.muted}>Changing the name and applying saves that match for your household.</Text>
    </ScrollView>
  ) : null;

  const capture = (
    <View style={styles.capture}>
      <Pressable
        accessibilityRole="button"
        style={styles.primaryBtn}
        testID="receipt-camera-button"
        onPress={() => void pick('camera')}>
        <Text style={styles.primaryBtnText}>Take photo</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        style={styles.secondaryBtn}
        testID="receipt-gallery-button"
        onPress={() => void pick('gallery')}>
        <Text style={styles.secondaryBtnText}>Choose from gallery</Text>
      </Pressable>
      {working ? <ActivityIndicator color={colors.primary} testID="receipt-working" /> : null}
      {permissionMessage ? (
        <Text style={styles.error} testID="receipt-permission-message">
          {permissionMessage}
        </Text>
      ) : null}
      {error ? (
        <Text style={styles.error} testID="receipt-error">
          {error}
        </Text>
      ) : null}
      {applied ? (
        <Text style={styles.ok} testID="receipt-applied">
          {applied}
        </Text>
      ) : null}
    </View>
  );

  const review = (
    <ScrollView contentContainerStyle={styles.list} testID="receipt-review" keyboardShouldPersistTaps="handled">
      {capture}
      {lines.map((line) => (
        <Pressable
          key={line.id}
          accessibilityRole="button"
          style={[styles.card, line.id === selectedId && styles.cardOn]}
          testID={`receipt-line-${line.id}`}
          onPress={() => setSelectedId(line.id)}>
          <Text style={[styles.itemName, line.skipped && styles.skipped]}>{line.name}</Text>
          <Text style={styles.muted}>
            {line.quantity}
            {line.unit ? ` ${line.unit}` : ''}
            {line.price !== undefined ? ` · $${line.price.toFixed(2)}` : ''}
            {line.skipped ? ' · skipped' : ''}
          </Text>
        </Pressable>
      ))}
      {!isTwoPane ? editor : null}
      {lines.length > 0 ? (
        <Pressable accessibilityRole="button" style={styles.primaryBtn} testID="receipt-apply-button" onPress={() => void apply()}>
          <Text style={styles.primaryBtnText}>Apply to pantry</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );

  return (
    <TwoPaneLayout
      testID="receipt-layout"
      primary={review}
      secondary={isTwoPane ? editor : null}
      placeholder={<Text style={styles.muted}>Select a line to edit the match.</Text>}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.background },
  capture: { gap: 10 },
  list: { padding: 16, gap: 10, paddingBottom: 32 },
  editor: { padding: 16, gap: 10 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 44,
  },
  cardOn: { borderColor: colors.primary },
  itemName: { color: colors.text, fontSize: 16, fontWeight: '600' },
  skipped: { color: colors.muted, textDecorationLine: 'line-through' },
  raw: { color: colors.text, fontSize: 15 },
  body: { color: colors.text, fontSize: 16 },
  muted: { color: colors.muted },
  error: { color: colors.danger },
  ok: { color: colors.primary, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  flex: { flex: 1 },
  input: {
    backgroundColor: colors.input,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    minHeight: 44,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    minHeight: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryBtnText: { color: colors.primaryText, fontWeight: '700' },
  secondaryBtn: {
    minHeight: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  secondaryBtnText: { color: colors.text, fontWeight: '600' },
});
