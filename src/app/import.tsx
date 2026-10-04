import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import * as Sharing from 'expo-sharing';

import { FeatureGate, FeatureLocked } from '@/components/feature-gate';
import { KeyboardAwareScrollView, MaxWidthContainer, MAX_CONTENT_WIDTH, useBottomInset } from '@/components/layout';
import { useFeature } from '@/hooks/use-feature';
import {
  importRecipe,
  parseImportDeepLink,
  sharedPayloadToText,
  sharedPdfUri,
  shareTextToImportInput,
  type ImportErrorCode,
  type ImportResult,
  type RecipeImportInput,
} from '@/import';
import { importErrorMessage } from '@/lib/import-messages';
import { isRemotePhoto } from '@/lib/photo-path';
import { downloadRecipePhoto } from '@/lib/photos';
import { makeStyles, useColors } from '@/hooks/use-theme';
import { recipeStore } from '@/storage/recipes';

/**
 * Paste a link or recipe text, or receive an Android share / deep link (spec #1).
 * Every path calls importRecipe. "Import link" saves the recipe straight away (v1.0.1, Jason: no
 * Save / Save-and-edit choice); pasted text, shares and deep links are shown as a draft until the user saves.
 * A link that is already in your recipes still shows "Already in your recipes" instead of saving.
 */
export default function ImportScreen() {
  return (
    <FeatureGate id="linkImport" fallback={<FeatureLocked id="linkImport" />}>
      <ImportBody />
    </FeatureGate>
  );
}

function ImportBody() {
  const bottomInset = useBottomInset();
  const styles = useStyles();
  const colors = useColors();
  const params = useLocalSearchParams<{ url?: string; text?: string; incoming?: string }>();
  const photos = useFeature('photos').available;
  const [url, setUrl] = useState(typeof params.url === 'string' ? params.url : '');
  const [text, setText] = useState(typeof params.text === 'string' ? params.text : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code: ImportErrorCode; message: string } | null>(null);
  const [draft, setDraft] = useState<Extract<ImportResult, { ok: true }> | null>(null);
  const [pending, setPending] = useState<RecipeImportInput | null>(null);

  const preview = useCallback(async (input: RecipeImportInput) => {
    setBusy(true);
    setError(null);
    setDraft(null);
    setPending(input);
    const result = await importRecipe(input, { dryRun: true });
    setBusy(false);
    if (!result.ok) {
      setError({ code: result.code, message: importErrorMessage(result.code, result.errors) });
      return;
    }
    setDraft(result);
  }, []);

  useEffect(() => {
    const paramUrl = firstParam(params.url);
    const paramText = firstParam(params.text);
    const input: RecipeImportInput | undefined = paramUrl
      ? (parseImportDeepLink(`myrecipeapp://import?url=${encodeURIComponent(paramUrl)}`) ?? {
          kind: 'url',
          url: paramUrl,
          source: { channel: 'deep-link' },
        })
      : paramText
        ? (parseImportDeepLink(`myrecipeapp://import?text=${encodeURIComponent(paramText)}`) ?? {
            kind: 'text',
            text: paramText,
            source: { channel: 'deep-link' },
          })
        : undefined;
    if (!input) return;
    let active = true;
    // Yield once so this effect only schedules the draft; it does not setState synchronously.
    void Promise.resolve().then(() => {
      if (active) void preview(input);
    });
    return () => {
      active = false;
    };
  }, [params.url, params.text, preview]);

  useEffect(() => {
    if (firstParam(params.incoming) !== '1') return;
    let active = true;
    (async () => {
      const resolved = await Sharing.getResolvedSharedPayloadsAsync().catch(() => []);
      const raw = resolved.length ? resolved : Sharing.getSharedPayloads();
      const pdf = sharedPdfUri(raw as never);
      if (pdf) {
        // A shared PDF goes to Import PDF (v1.0.6).
        Sharing.clearSharedPayloads();
        if (active) router.replace({ pathname: '/import-pdf', params: { uri: pdf } });
        return;
      }
      const shared = sharedPayloadToText(raw);
      Sharing.clearSharedPayloads();
      if (!active) return;
      if (!shared) {
        setError({
          code: 'no_recipe_found',
          message: 'Nothing to import from that share. Paste a recipe link or the recipe text.',
        });
        return;
      }
      if (/^https?:\/\//i.test(shared.trim())) setUrl(shared.trim());
      else setText(shared);
      await preview(shareTextToImportInput(shared));
    })();
    return () => {
      active = false;
    };
  }, [params.incoming, preview]);

  /** "Import link": check (errors / duplicate exactly as the draft path), then save with no extra prompt. */
  async function importLinkNow(input: RecipeImportInput) {
    setBusy(true);
    setError(null);
    setDraft(null);
    setPending(input);
    const checked = await importRecipe(input, { dryRun: true });
    if (!checked.ok) {
      setBusy(false);
      setError({ code: checked.code, message: importErrorMessage(checked.code, checked.errors) });
      return;
    }
    if (checked.status === 'duplicate') {
      setBusy(false);
      setDraft(checked);
      return;
    }
    await commit(false, input);
  }

  async function commit(andEdit: boolean, input: RecipeImportInput | null = pending) {
    if (!input) return;
    setBusy(true);
    setError(null);
    const result = await importRecipe(input);
    if (!result.ok) {
      setBusy(false);
      setError({ code: result.code, message: importErrorMessage(result.code, result.errors) });
      return;
    }
    let saved = result.recipe;
    if (photos && result.status !== 'duplicate' && isRemotePhoto(saved.photoUri)) {
      try {
        const local = await downloadRecipePhoto(saved.photoUri!, saved.id);
        saved = { ...saved, photoUri: local };
        await recipeStore.save(saved);
      } catch {
        // Keep the remote URL; the recipe itself was saved.
      }
    }
    setBusy(false);
    if (andEdit && result.status !== 'duplicate') {
      router.replace({ pathname: '/recipe/[id]/edit', params: { id: saved.id } });
    } else {
      router.replace({ pathname: '/recipe/[id]', params: { id: saved.id } });
    }
  }

  const duplicate = draft?.status === 'duplicate';

  return (
    <MaxWidthContainer maxWidth={MAX_CONTENT_WIDTH.form}>
      <Stack.Screen options={{ title: 'Import recipe' }} />
      <KeyboardAwareScrollView contentContainerStyle={[styles.container, { paddingBottom: 48 + bottomInset }]} testID="import-screen">
        <Text style={styles.lead}>Paste a recipe link. The page is read as schema.org JSON-LD, then microdata or the page text.</Text>
        <Text style={styles.label}>Recipe link</Text>
        <TextInput
          value={url}
          onChangeText={setUrl}
          placeholder="https://example.com/recipe"
          placeholderTextColor={colors.placeholder}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={styles.input}
          testID="import-url-input"
        />
        <Pressable
          style={styles.button}
          accessibilityRole="button"
          testID="import-url-button"
          onPress={() => {
            const trimmed = url.trim();
            if (!trimmed) {
              setDraft(null);
              setError({ code: 'invalid_input', message: 'Paste a recipe link first.' });
              return;
            }
            void importLinkNow({ kind: 'url', url: trimmed, source: { channel: 'app-link' } });
          }}>
          <Text style={styles.buttonText}>Import link</Text>
        </Pressable>

        <Text style={styles.label}>Or paste the recipe</Text>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={'Title\nIngredients:\n- 2 tbsp allulose\nSteps:\n1. Mix'}
          placeholderTextColor={colors.placeholder}
          style={[styles.input, styles.multiline]}
          multiline
          testID="import-text-input"
        />
        <Pressable
          style={styles.button}
          accessibilityRole="button"
          testID="import-text-button"
          onPress={() => {
            const trimmed = text.trim();
            if (!trimmed) {
              setDraft(null);
              setError({ code: 'invalid_input', message: 'Paste the recipe text first.' });
              return;
            }
            void preview({ kind: 'text', text: trimmed, source: { channel: 'app-text' } });
          }}>
          <Text style={styles.buttonText}>Import text</Text>
        </Pressable>

        {busy ? <ActivityIndicator color={colors.primary} style={styles.spinner} /> : null}
        {error ? (
          <View style={styles.errorBox} testID="import-error">
            <Text style={styles.error} testID={`import-error-${error.code}`}>
              {error.message}
            </Text>
          </View>
        ) : null}
        {draft ? (
          <View style={styles.draft} testID="import-draft">
            <Text style={styles.draftTitle}>{duplicate ? 'Already in your recipes' : 'Draft'}</Text>
            <Text style={styles.recipeTitle}>{draft.recipe.title}</Text>
            <Text style={styles.meta}>
              {draft.recipe.ingredients.length} ingredients · {draft.recipe.steps.length} steps
            </Text>
            {draft.warnings.map((warning) => (
              <Text key={warning} style={styles.warning}>
                • {warning}
              </Text>
            ))}
            {duplicate ? (
              <Pressable
                style={styles.button}
                accessibilityRole="button"
                testID="import-open-existing"
                onPress={() => router.replace({ pathname: '/recipe/[id]', params: { id: draft.recipe.id } })}>
                <Text style={styles.buttonText}>Open existing recipe</Text>
              </Pressable>
            ) : (
              <View style={styles.row}>
                <Pressable
                  style={[styles.button, styles.flex]}
                  accessibilityRole="button"
                  testID="import-save"
                  onPress={() => void commit(false)}>
                  <Text style={styles.buttonText}>Save recipe</Text>
                </Pressable>
                <Pressable
                  style={[styles.secondary, styles.flex]}
                  accessibilityRole="button"
                  testID="import-save-edit"
                  onPress={() => void commit(true)}>
                  <Text style={styles.secondaryText}>Save and edit</Text>
                </Pressable>
              </View>
            )}
          </View>
        ) : null}
      </KeyboardAwareScrollView>
    </MaxWidthContainer>
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

const useStyles = makeStyles((colors) => ({
  container: { padding: 16, paddingBottom: 48 },
  lead: { color: colors.muted, marginBottom: 16, fontSize: 15, lineHeight: 22 },
  label: { color: colors.text, fontWeight: '600', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    backgroundColor: colors.input,
    color: colors.text,
    fontSize: 16,
    marginBottom: 10,
  },
  multiline: { minHeight: 140, textAlignVertical: 'top' },
  button: {
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  buttonText: { color: colors.primaryText, fontWeight: '700', fontSize: 16 },
  secondary: {
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  secondaryText: { color: colors.primary, fontWeight: '700', fontSize: 16 },
  spinner: { marginVertical: 12 },
  errorBox: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  error: { color: colors.danger, fontSize: 15, lineHeight: 22 },
  draft: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 14,
    marginTop: 4,
  },
  draftTitle: { color: colors.primary, fontWeight: '700', marginBottom: 6 },
  recipeTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  meta: { color: colors.muted, marginTop: 6, marginBottom: 8 },
  warning: { color: colors.text, marginBottom: 4 },
  row: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
}));
