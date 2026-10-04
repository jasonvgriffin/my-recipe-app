import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { CategoryChips, toggleCategoryId } from '@/components/category-chips';
import { FeatureGate, FeatureLocked } from '@/components/feature-gate';
import { MaxWidthContainer, MAX_CONTENT_WIDTH, useBottomInset } from '@/components/layout';
import { useFeature } from '@/hooks/use-feature';
import { makeStyles, useColors } from '@/hooks/use-theme';
import { appImportDeps } from '@/import/app-deps';
import { importPdfCandidates, readRecipesFromPdf, PDF_MESSAGES, type PdfCandidate } from '@/import/pdf';
import { pickPdfBytes, readPdfUri } from '@/lib/pdf-file';
import { recipeStore } from '@/storage/recipes';
import type { Category } from '@/types/recipe';

/**
 * Import PDF (v1.0.6, + menu → Import PDF, or Share → My Recipe App on a PDF). Reads the PDF on the phone, lists the
 * recipes it found (several when the PDF holds several, e.g. one exported from this app), and imports the ones
 * left checked into the chosen categories (none = Uncategorized). Scans / image-only PDFs get a clear message.
 */
export default function ImportPdfScreen() {
  return (
    <FeatureGate id="linkImport" fallback={<FeatureLocked id="linkImport" />}>
      <ImportPdfBody />
    </FeatureGate>
  );
}

function ImportPdfBody() {
  const styles = useStyles();
  const colors = useColors();
  const bottomInset = useBottomInset();
  const params = useLocalSearchParams<{ uri?: string }>();
  const categoriesOn = useFeature('categories').available;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ reason: string; message: string } | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<PdfCandidate[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);

  useEffect(() => {
    if (!categoriesOn) return;
    let active = true;
    void recipeStore.listCategories().then((list) => active && setCategories(list));
    return () => {
      active = false;
    };
  }, [categoriesOn]);

  async function read(load: () => Promise<{ name: string; bytes: Uint8Array } | null>) {
    setError(null);
    setBusy(true);
    try {
      const file = await load();
      if (!file) return; // picker cancelled
      setFileName(file.name);
      setCandidates([]);
      const result = await readRecipesFromPdf(file.bytes, appImportDeps);
      if (!result.ok) {
        setError({ reason: result.reason, message: result.message });
        return;
      }
      setCandidates(result.candidates);
      setSkipped(result.skipped);
      setChecked(
        new Set(result.candidates.map((c, i) => (c.result.status === 'duplicate' ? -1 : i)).filter((i) => i >= 0)),
      );
      setOpen(new Set(result.candidates.length === 1 ? [0] : []));
    } catch {
      setError({ reason: 'unreadable', message: PDF_MESSAGES.unreadable });
    } finally {
      setBusy(false);
    }
  }

  const sharedUri = typeof params.uri === 'string' ? params.uri : undefined;
  useEffect(() => {
    if (!sharedUri) return;
    let active = true;
    void Promise.resolve().then(() => {
      if (active)
        void read(async () => ({
          name: decodeURIComponent(sharedUri.split('/').pop() ?? 'Shared PDF'),
          bytes: await readPdfUri(sharedUri),
        }));
    });
    return () => {
      active = false;
    };
  }, [sharedUri]);

  async function importChecked() {
    const chosen = candidates.filter((_, i) => checked.has(i));
    if (!chosen.length) return;
    setBusy(true);
    try {
      const results = await importPdfCandidates(chosen, categoriesOn ? categoryIds : [], appImportDeps);
      const saved = results.filter((r) => r.ok && r.status !== 'duplicate');
      const failed = results.find((r) => !r.ok);
      if (failed && !failed.ok) {
        setError({ reason: failed.code, message: failed.errors.join(' ') });
        return;
      }
      if (saved.length === 1 && saved[0].ok)
        router.replace({ pathname: '/recipe/[id]', params: { id: saved[0].recipe.id } });
      else router.replace('/recipes');
    } finally {
      setBusy(false);
    }
  }

  const toggle = (set: Set<number>, i: number) => {
    const next = new Set(set);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    return next;
  };
  const count = checked.size;

  return (
    <MaxWidthContainer maxWidth={MAX_CONTENT_WIDTH.form}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: 48 + bottomInset }]}
        testID="import-pdf-screen">
        <Text style={styles.lead}>
          Pick a PDF with one or more recipes, like one shared from this app or saved from a website. It’s read on your
          phone; nothing is uploaded.
        </Text>
        <Pressable
          accessibilityRole="button"
          style={styles.button}
          disabled={busy}
          testID="import-pdf-pick"
          onPress={() => void read(pickPdfBytes)}>
          <Text style={styles.buttonText}>{fileName ? 'Choose another PDF' : 'Choose PDF'}</Text>
        </Pressable>
        {fileName ? (
          <Text style={styles.meta} testID="import-pdf-file">
            {fileName}
          </Text>
        ) : null}
        {busy ? <ActivityIndicator color={colors.primary} style={styles.spinner} testID="import-pdf-busy" /> : null}
        {error ? (
          <View style={styles.errorBox} testID="import-pdf-error">
            <Text style={styles.error} testID={`import-pdf-error-${error.reason}`}>
              {error.message}
            </Text>
          </View>
        ) : null}
        {skipped.map((s) => (
          <Text key={s} style={styles.warning}>
            Skipped {s}
          </Text>
        ))}
        {candidates.length ? (
          <View testID="import-pdf-candidates">
            <Text style={styles.section}>
              Found {candidates.length} recipe{candidates.length === 1 ? '' : 's'}
            </Text>
            {candidates.map((c, i) => {
              const r = c.result.recipe;
              const duplicate = c.result.status === 'duplicate';
              const isChecked = checked.has(i);
              const isOpen = open.has(i);
              return (
                <View key={i} style={styles.card}>
                  <View style={styles.cardRow}>
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: isChecked, disabled: duplicate }}
                      accessibilityLabel={`Import ${r.title}`}
                      disabled={duplicate}
                      onPress={() => setChecked((s) => toggle(s, i))}
                      style={styles.check}
                      testID={`import-pdf-candidate-${i}`}>
                      <Ionicons
                        name={isChecked ? 'checkbox' : 'square-outline'}
                        size={26}
                        color={duplicate ? colors.muted : colors.primary}
                      />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ expanded: isOpen }}
                      style={styles.flex}
                      onPress={() => setOpen((s) => toggle(s, i))}
                      testID={`import-pdf-toggle-${i}`}>
                      <Text style={styles.title}>{r.title}</Text>
                      <Text style={styles.meta}>
                        {r.ingredients.length} ingredients · {r.steps.length} steps · serves {r.servings}
                        {duplicate ? ' · Already in your recipes' : ''}
                      </Text>
                    </Pressable>
                  </View>
                  {isOpen ? (
                    <View style={styles.preview} testID={`import-pdf-preview-${i}`}>
                      {r.description ? <Text style={styles.body}>{r.description}</Text> : null}
                      <Text style={styles.sub}>Ingredients</Text>
                      {r.ingredients.map((ing, k) => (
                        <Text key={k} style={styles.body}>
                          • {ing.text}
                        </Text>
                      ))}
                      <Text style={styles.sub}>Steps</Text>
                      {r.steps.map((st, k) => (
                        <Text key={k} style={styles.body}>
                          {k + 1}. {st.text}
                        </Text>
                      ))}
                      {r.notes ? (
                        <>
                          <Text style={styles.sub}>Notes</Text>
                          <Text style={styles.body}>{r.notes}</Text>
                        </>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
            {categoriesOn && categories.length ? (
              <View style={styles.block}>
                <Text style={styles.section}>Categories</Text>
                <CategoryChips
                  categories={categories}
                  selectedIds={categoryIds}
                  onToggle={(id) => setCategoryIds((ids) => toggleCategoryId(ids, id))}
                  testIDPrefix="import-pdf-category"
                />
              </View>
            ) : null}
            <Pressable
              accessibilityRole="button"
              style={[styles.button, (count === 0 || busy) && styles.disabled]}
              disabled={count === 0 || busy}
              testID="import-pdf-import"
              onPress={() => void importChecked()}>
              <Text style={styles.buttonText}>
                {count === 0 ? 'Select recipes to import' : `Import ${count} recipe${count === 1 ? '' : 's'}`}
              </Text>
            </Pressable>
            <Text style={styles.meta}>You can edit each recipe after importing.</Text>
          </View>
        ) : null}
      </ScrollView>
    </MaxWidthContainer>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { padding: 16 },
  lead: { color: colors.muted, marginBottom: 16, fontSize: 15, lineHeight: 22 },
  button: {
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    marginVertical: 12,
  },
  disabled: { opacity: 0.5 },
  buttonText: { color: colors.primaryText, fontWeight: '700', fontSize: 16 },
  spinner: { marginVertical: 12 },
  errorBox: { borderWidth: 1, borderColor: colors.danger, borderRadius: 8, padding: 12, marginVertical: 12 },
  error: { color: colors.danger, fontSize: 15, lineHeight: 22 },
  warning: { color: colors.muted, marginBottom: 6 },
  section: { color: colors.text, fontWeight: '700', fontSize: 17, marginTop: 12, marginBottom: 8 },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  check: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, minHeight: 44, justifyContent: 'center' },
  title: { color: colors.text, fontWeight: '700', fontSize: 16 },
  meta: { color: colors.muted, fontSize: 14 },
  preview: { marginTop: 8, paddingLeft: 52, gap: 2 },
  sub: { color: colors.text, fontWeight: '700', marginTop: 8 },
  body: { color: colors.text, fontSize: 14, lineHeight: 20 },
  block: { marginTop: 8 },
}));
