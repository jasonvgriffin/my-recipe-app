import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { useFeature } from '@/hooks/use-feature';
import { presentShare } from '@/lib/present-share';
import { buildShareRequest, type ShareParts } from '@/lib/share-recipe';
import { makeStyles, useColors } from '@/hooks/use-theme';
import type { Recipe } from '@/types/recipe';

/** Choose recipe text, photo, and/or the source link, then open the share sheet (spec #14). */
export function ShareRecipePanel({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const styles = useStyles();
  const colors = useColors();
  const photos = useFeature('photos').available;
  const [parts, setParts] = useState<ShareParts>({ text: true, photo: false, link: false });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggle(key: keyof ShareParts) {
    setParts((current) => ({ ...current, [key]: !current[key] }));
    setError(null);
  }

  async function onShare() {
    const built = buildShareRequest(recipe, {
      text: parts.text,
      photo: parts.photo && photos,
      link: parts.link,
    });
    if (!built.ok) {
      setError(built.error);
      return;
    }
    setBusy(true);
    try {
      await presentShare(built.request);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the share sheet.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.panel} testID="share-panel">
      <Text style={styles.title}>Share</Text>
      <Text style={styles.hint}>Choose any combination, then pick an app.</Text>
      <Toggle label="Recipe text" on={parts.text} onPress={() => toggle('text')} testID="share-toggle-text" />
      {photos ? (
        <Toggle
          label={recipe.photoUri ? 'Photo' : 'Photo (none on this recipe)'}
          on={parts.photo}
          disabled={!recipe.photoUri}
          onPress={() => toggle('photo')}
          testID="share-toggle-photo"
        />
      ) : null}
      <Toggle
        label={recipe.sourceUrl ? 'Source link' : 'Source link (none on this recipe)'}
        on={parts.link}
        disabled={!recipe.sourceUrl}
        onPress={() => toggle('link')}
        testID="share-toggle-link"
      />
      {error ? (
        <Text style={styles.error} testID="share-error">
          {error}
        </Text>
      ) : null}
      <View style={styles.row}>
        <Pressable style={styles.secondary} onPress={onClose} accessibilityRole="button">
          <Text style={styles.secondaryText}>Cancel</Text>
        </Pressable>
        <Pressable
          style={[styles.primary, busy && styles.disabled]}
          onPress={onShare}
          disabled={busy}
          accessibilityRole="button"
          testID="share-confirm">
          {busy ? <ActivityIndicator color={colors.primaryText} /> : <Text style={styles.primaryText}>Share</Text>}
        </Pressable>
      </View>
    </View>
  );
}

function Toggle({
  label,
  on,
  disabled,
  onPress,
  testID,
}: {
  label: string;
  on: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID: string;
}) {
  const styles = useStyles();
  return (
    <Pressable
      style={[styles.toggle, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on, disabled: !!disabled }}
      testID={testID}>
      <Text style={styles.box}>{on ? '☑' : '☐'}</Text>
      <Text style={styles.toggleLabel}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  panel: {
    marginTop: 16,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    gap: 8,
  },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  hint: { color: colors.muted, marginBottom: 4 },
  toggle: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 10 },
  box: { color: colors.primary, fontSize: 20, width: 28 },
  toggleLabel: { color: colors.text, fontSize: 16, flex: 1 },
  error: { color: colors.danger },
  row: { flexDirection: 'row', gap: 8, marginTop: 4 },
  primary: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: colors.primaryText, fontWeight: '700', fontSize: 16 },
  secondary: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: colors.text, fontWeight: '600' },
  disabled: { opacity: 0.5 },
}));
