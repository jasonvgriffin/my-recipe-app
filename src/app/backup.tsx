import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import type { BackupSummary, ParseResult, RestoreMode, RestoreResult } from '@/backup';
import * as backupDevice from '@/backup/device';
import { MaxWidthContainer, MAX_CONTENT_WIDTH, useBottomInset } from '@/components/layout';
import { makeStyles } from '@/hooks/use-theme';

/** Phone file/share functions (mocked in tests). */
const device = () => backupDevice;

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function describeSummary(s: BackupSummary): string[] {
  const lines = [
    plural(s.recipes, 'recipe'),
    plural(s.photos, 'photo'),
    plural(s.categories, 'category', 'categories'),
    plural(s.mealPlanEntries, 'meal plan entry', 'meal plan entries'),
    plural(s.shoppingItems, 'shopping list item'),
    plural(s.pantryItems, 'pantry item'),
  ];
  if (s.barcodeItems) lines.push(plural(s.barcodeItems, 'saved barcode'));
  if (s.hasSettings) lines.push('Settings and appearance');
  return lines;
}

function confirm(title: string, message: string, action: string): Promise<boolean> {
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: action, style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}

/**
 * Settings → Backup & restore (v1.0.6, docs/BACKUP.md). Export every recipe (with photos), category, tag, rating,
 * cooked history, meal plan, shopping list, pantry and the settings to one `.myrecipe` file; import it on a new
 * phone with a preview, then merge or replace (replace asks first). Offline, no account, no storage permission
 * (share sheet + system file picker). Core data safety: not gated.
 */
export default function BackupScreen() {
  const styles = useStyles();
  const bottomInset = useBottomInset();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [preview, setPreview] = useState<Extract<ParseResult, { ok: true }> | null>(null);

  async function run(fn: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error && e.message ? `Something went wrong: ${e.message}` : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const exported = (count: number) => `Backup ready: ${plural(count, 'recipe')}.`;

  function restored(r: RestoreResult, mode: RestoreMode): string {
    const parts = [`${plural(r.added, 'item')} added`, `${r.updated} updated`];
    if (mode === 'merge' && r.kept) parts.push(`${r.kept} kept (this phone’s copy was newer or already there)`);
    if (mode === 'replace' && r.removed) parts.push(`${r.removed} removed`);
    if (r.photos) parts.push(plural(r.photos, 'photo'));
    return `Restored: ${parts.join(', ')}.`;
  }

  async function restore(mode: RestoreMode): Promise<void> {
    if (!preview) return;
    if (mode === 'replace') {
      const ok = await confirm(
        'Replace everything?',
        'Recipes, meal plans, shopping lists and pantry on this phone that aren’t in the backup will be deleted. This can’t be undone.',
        'Replace',
      );
      if (!ok) return;
    }
    await run(async () => {
      const result = await device().restoreFromBackup(preview.backup, mode);
      setPreview(null);
      setMessage(restored(result, mode));
    });
  }

  return (
    <MaxWidthContainer maxWidth={MAX_CONTENT_WIDTH.form}>
      <ScrollView testID="backup-screen" contentContainerStyle={[styles.container, { paddingBottom: 48 + bottomInset }]}>
        <Text style={styles.help}>
          Save everything in one file: recipes with photos, categories, tags, ratings, cooked history, meal plans,
          shopping lists, pantry and your settings. Use it to move to a new phone. Works offline, no account needed.
        </Text>
        {message ? (
          <Text testID="backup-message" style={styles.success}>
            {message}
          </Text>
        ) : null}
        {error ? (
          <Text testID="backup-error" style={styles.error}>
            {error}
          </Text>
        ) : null}

        <Text style={styles.section}>Back up</Text>
        <Button
          testID="backup-share"
          label="Share backup file…"
          disabled={busy}
          onPress={() =>
            void run(async () => {
              const b = await device().shareBackup();
              setMessage(exported(b.data.recipes.length));
            })
          }
        />
        <Button
          testID="backup-save"
          label="Save to a folder…"
          kind="ghost"
          disabled={busy}
          onPress={() =>
            void run(async () => {
              const b = await device().saveBackupToFolder();
              if (b) setMessage(`Saved. ${exported(b.data.recipes.length)}`);
            })
          }
        />

        <Text style={styles.section}>Restore</Text>
        <Text style={styles.help}>Pick a .myrecipe backup file. You’ll see what’s in it before anything changes.</Text>
        <Button
          testID="backup-pick"
          label="Choose backup file…"
          kind="ghost"
          disabled={busy}
          onPress={() =>
            void run(async () => {
              setPreview(null);
              const parsed = await device().pickBackupFile();
              if (!parsed) return;
              if (!parsed.ok) setError(parsed.error);
              else setPreview(parsed);
            })
          }
        />
        {preview ? (
          <View testID="backup-preview" style={styles.card}>
            <Text style={styles.label}>
              Backup from {new Date(preview.summary.exportedAt).toLocaleString()}
              {preview.summary.appVersion ? ` (app ${preview.summary.appVersion})` : ''}
            </Text>
            {describeSummary(preview.summary).map((line) => (
              <Text key={line} style={styles.help}>
                • {line}
              </Text>
            ))}
            <Text style={styles.help}>
              Merge keeps everything on this phone and adds what’s new (the newer copy of a recipe wins). Replace makes
              this phone match the backup.
            </Text>
            <Button testID="backup-merge" label="Merge into this phone" disabled={busy} onPress={() => void restore('merge')} />
            <Button
              testID="backup-replace"
              label="Replace this phone’s data"
              kind="danger"
              disabled={busy}
              onPress={() => void restore('replace')}
            />
            <Button testID="backup-cancel" label="Cancel" kind="ghost" disabled={busy} onPress={() => setPreview(null)} />
          </View>
        ) : null}
      </ScrollView>
    </MaxWidthContainer>
  );
}

function Button({
  label,
  onPress,
  disabled,
  testID,
  kind = 'primary',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID: string;
  kind?: 'primary' | 'ghost' | 'danger';
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, kind === 'ghost' && styles.ghost, kind === 'danger' && styles.danger, disabled && styles.disabled]}>
      <Text style={[styles.buttonText, kind === 'ghost' && styles.ghostText, kind === 'danger' && styles.dangerText]}>
        {label}
      </Text>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { padding: 16, gap: 10 },
  section: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 8 },
  help: { color: colors.muted, fontSize: 14 },
  label: { color: colors.text, fontWeight: '600', fontSize: 15 },
  success: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  error: { color: colors.danger, fontSize: 15 },
  card: { gap: 6, backgroundColor: colors.card, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: colors.border },
  button: {
    marginTop: 4,
    backgroundColor: colors.primary,
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: colors.primaryText, fontWeight: '700', fontSize: 16 },
  ghost: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.primary },
  ghostText: { color: colors.primary },
  danger: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.danger },
  dangerText: { color: colors.danger },
  disabled: { opacity: 0.5 },
}));
