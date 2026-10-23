import { Stack, router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';
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
 * Every path calls importRecipe. A link import is saved as soon as it succeeds and opens that recipe.
 * Pasted text stays a draft until Save. A duplicate link opens the recipe already stored.
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
  const [error, setError] = useState<{ code: ImportErrorCode | 'save_failed'; message: string } | null>(null);
  const [draft, setDraft] = useState<Extract<ImportResult, { ok: true }> | null>(null);
  const [pending, setPending] = useState<RecipeImportInput | null>(null);
  // True after a field edit drops a non-duplicate preview, so Save stays on screen and disabled.
  const [blocked, setBlocked] = useState(false);
  const draftRef = useRef(draft);
  const pendingRef = useRef(pending);
  const leaveRef = useRef(false);
  const requestRef = useRef(0);
  const mountedRef = useRef(true);
  const persistLock = useRef(false);
  const phaseRef = useRef<'idle' | 'url-dry' | 'url-persist'>('idle');
  const navigation = useNavigation();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const rememberDraft = useCallback((next: Extract<ImportResult, { ok: true }> | null) => {
    draftRef.current = next;
    setDraft(next);
    leaveRef.current = Boolean(next && next.status !== 'duplicate');
  }, []);

  const rememberPending = useCallback((next: RecipeImportInput | null) => {
    pendingRef.current = next;
    setPending(next);
  }, []);

  /** Drop a non-duplicate preview so Save cannot write the page that was just cleared. */
  const invalidatePreview = useCallback(() => {
    const current = draftRef.current;
    if (current?.status === 'duplicate') return;
    if (!current && !pendingRef.current) return;
    requestRef.current += 1;
    leaveRef.current = false;
    rememberDraft(null);
    rememberPending(null);
    setBlocked(true);
    setBusy(false);
  }, [rememberDraft, rememberPending]);

  const preview = useCallback(async (input: RecipeImportInput) => {
    if (persistLock.current) return;
    phaseRef.current = 'idle';
    const request = ++requestRef.current;
    setBusy(true);
    setError(null);
    setBlocked(false);
    leaveRef.current = false;
    rememberDraft(null);
    rememberPending(input);
    const result = await importRecipe(input, { dryRun: true });
    if (request !== requestRef.current) return;
    setBusy(false);
    if (!result.ok) {
      rememberPending(null);
      setError({ code: result.code, message: importErrorMessage(result.code, result.errors) });
      return;
    }
    rememberDraft(result);
  }, [rememberDraft, rememberPending]);

  const commit = useCallback(
    async (mode: 'open' | 'edit' | 'none'): Promise<boolean> => {
      const input = pendingRef.current;
      const current = draftRef.current;
      if (!input || !current || current.status === 'duplicate') return false;
      setBusy(true);
      setError(null);
      try {
        const result = await importRecipe(input);
        if (!result.ok) {
          setBusy(false);
          setError({ code: result.code, message: importErrorMessage(result.code, result.errors) });
          return false;
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
        // Clear before replace so beforeRemove does not warn for a recipe already stored.
        leaveRef.current = false;
        rememberDraft(null);
        rememberPending(null);
        setBlocked(false);
        setBusy(false);
        if (mode === 'edit' && result.status !== 'duplicate' && mountedRef.current) {
          router.replace({ pathname: '/recipe/[id]/edit', params: { id: saved.id } });
        } else if (mode === 'open' && mountedRef.current) {
          router.replace({ pathname: '/recipe/[id]', params: { id: saved.id } });
        }
        return true;
      } catch {
        setBusy(false);
        setError({ code: 'save_failed', message: 'Could not save that recipe. Try again.' });
        return false;
      }
    },
    [photos, rememberDraft, rememberPending],
  );

  const runUrlImport = useCallback(
    async (input: RecipeImportInput) => {
      if (persistLock.current) return;
      const request = ++requestRef.current;
      phaseRef.current = 'url-dry';
      setBusy(true);
      setError(null);
      setBlocked(false);
      leaveRef.current = false;
      rememberDraft(null);
      rememberPending(null);
      const result = await importRecipe(input, { dryRun: true });
      if (request !== requestRef.current || phaseRef.current !== 'url-dry') return;
      if (!result.ok) {
        phaseRef.current = 'idle';
        setBusy(false);
        setError({ code: result.code, message: importErrorMessage(result.code, result.errors) });
        return;
      }
      if (result.status === 'duplicate') {
        phaseRef.current = 'idle';
        setBusy(false);
        if (mountedRef.current) {
          router.replace({ pathname: '/recipe/[id]', params: { id: result.recipe.id } });
        }
        return;
      }
      phaseRef.current = 'url-persist';
      persistLock.current = true;
      pendingRef.current = input;
      draftRef.current = result;
      leaveRef.current = false;
      try {
        const saved = await commit('open');
        if (!saved) {
          rememberDraft(null);
          rememberPending(null);
          setBlocked(false);
        }
      } finally {
        persistLock.current = false;
        if (phaseRef.current === 'url-persist') phaseRef.current = 'idle';
      }
    },
    [commit, rememberDraft, rememberPending],
  );

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
    // Yield once so this effect only schedules the import; it does not setState synchronously.
    void Promise.resolve().then(() => {
      if (!active) return;
      if (input.kind === 'url') void runUrlImport(input);
      else void preview(input);
    });
    return () => {
      active = false;
    };
  }, [params.url, params.text, preview, runUrlImport]);

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
      const sharedInput = shareTextToImportInput(shared);
      if (sharedInput.kind === 'url') await runUrlImport(sharedInput);
      else await preview(sharedInput);
    })();
    return () => {
      active = false;
    };
  }, [params.incoming, preview, runUrlImport]);

  // Ask before leaving while a non-duplicate text draft is on screen. A link check still running is dropped.
  useEffect(() => {
    return navigation.addListener('beforeRemove', (e) => {
      if (!leaveRef.current) {
        if (phaseRef.current === 'url-dry') {
          requestRef.current += 1;
          phaseRef.current = 'idle';
          setBusy(false);
        }
        return;
      }
      e.preventDefault();
      Alert.alert('Save changes?', 'You have an imported recipe that hasn’t been saved.', [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            leaveRef.current = false;
            navigation.dispatch(e.data.action);
          },
        },
        {
          text: 'Save',
          onPress: () => {
            void commit('none').then((saved) => {
              if (!saved) return;
              leaveRef.current = false;
              navigation.dispatch(e.data.action);
            });
          },
        },
      ]);
    });
  }, [navigation, commit]);

  const duplicate = draft?.status === 'duplicate';
  const canSave = Boolean(draft && !duplicate && !busy);
  const showSaveBar = Boolean((draft && !duplicate) || blocked);

  function dropUrlCheck() {
    if (phaseRef.current !== 'url-dry') return;
    requestRef.current += 1;
    phaseRef.current = 'idle';
    setBusy(false);
    setError(null);
  }

  function rejectEmpty(message: string) {
    requestRef.current += 1;
    phaseRef.current = 'idle';
    leaveRef.current = false;
    rememberDraft(null);
    rememberPending(null);
    setBlocked(false);
    setBusy(false);
    setError({ code: 'invalid_input', message });
  }

  return (
    <MaxWidthContainer maxWidth={MAX_CONTENT_WIDTH.form}>
      <Stack.Screen options={{ title: 'Import recipe' }} />
      <View style={[styles.screen, { paddingBottom: bottomInset }]}>
        <KeyboardAwareScrollView style={styles.scroll} contentContainerStyle={styles.container} testID="import-screen">
          <Text style={styles.lead}>Paste a recipe link. The page is read as schema.org JSON-LD, then microdata or the page text.</Text>
          <Text style={styles.label}>Recipe link</Text>
          <TextInput
            value={url}
            onChangeText={(value) => {
              setUrl(value);
              dropUrlCheck();
              invalidatePreview();
            }}
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
                rejectEmpty('Paste a recipe link first.');
                return;
              }
              void runUrlImport({ kind: 'url', url: trimmed, source: { channel: 'app-link' } });
            }}>
            <Text style={styles.buttonText}>Import link</Text>
          </Pressable>

          <Text style={styles.label}>Or paste the recipe</Text>
          <TextInput
            value={text}
            onChangeText={(value) => {
              setText(value);
              dropUrlCheck();
              invalidatePreview();
            }}
            placeholder={'Title\nIngredients:\n- 2 tbsp olive oil\nSteps:\n1. Mix'}
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
              if (persistLock.current) return;
              const trimmed = text.trim();
              if (!trimmed) {
                rejectEmpty('Paste the recipe text first.');
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
              ) : null}
            </View>
          ) : null}
        </KeyboardAwareScrollView>
        {showSaveBar ? (
          <View style={styles.saveBar} testID="import-save-bar">
            <Pressable
              style={[styles.button, styles.barButton, styles.flex, !canSave && styles.disabled]}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSave }}
              disabled={!canSave}
              testID="import-save"
              onPress={() => void commit('open')}>
              <Text style={styles.buttonText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                Save recipe
              </Text>
            </Pressable>
            <Pressable
              style={[styles.secondary, styles.barButton, styles.flex, !canSave && styles.disabled]}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSave }}
              disabled={!canSave}
              testID="import-save-edit"
              onPress={() => void commit('edit')}>
              <Text style={styles.secondaryText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                Save and edit
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </MaxWidthContainer>
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1 },
  scroll: { flex: 1 },
  container: { padding: 16, paddingBottom: 48 },
  saveBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  barButton: { marginBottom: 0 },
  disabled: { opacity: 0.5 },
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
  flex: { flex: 1 },
}));
