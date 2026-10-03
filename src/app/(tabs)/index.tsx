import { router, type Href } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { MAX_CONTENT_WIDTH, MaxWidthContainer, useBottomInset } from '@/components/layout';
import type { FeatureId } from '@/entitlements';
import { useFeature } from '@/hooks/use-feature';
import { makeStyles } from '@/hooks/use-theme';

interface HomeAction {
  label: string;
  href: Href;
  testID: string;
  /** Screen-reader hint only (v1.0.2: titles only on screen, no gray subtitle). */
  hint: string;
  /** Optional feature behind the button: a LOCKED feature hides it quietly (paywall-ready gating). */
  gate?: FeatureId;
}

/**
 * Recipes tab (v1.0.1; since v1.0.2 plain green titles, no cards or subtitles): five clear options, each opening existing functionality. RECIPES ARE THE CORE: no
 * onboarding, no sign-in; the app opens here.
 * - Search / Existing Recipes → `recipes.tsx` (keyword search, filters, list)
 * - Share Recipes → v1.0.3: pick recipes and share them as a PDF (`recipes.tsx?select=pdf`, gate `pdfExport`).
 *   Household sharing stays under More → Household (and Settings → Household).
 * - Add Recipe → `add.tsx` (which links to import from a link / text)
 * - What can I make… → `pantry-match.tsx` (explains gently when the optional pantry is hidden or empty)
 * Share and pantry-match disappear quietly when their feature is LOCKED by the gate (never in v1: all free).
 */
const ACTIONS: HomeAction[] = [
  {
    label: 'Search',
    href: '/recipes?focus=search',
    testID: 'home-search',
    hint: 'Find a recipe by title, ingredient, note or tag',
  },
  {
    label: 'Existing Recipes',
    href: '/recipes',
    testID: 'home-existing',
    hint: 'Browse, filter and open your recipes',
  },
  {
    label: 'Share Recipes',
    href: '/recipes?select=pdf',
    testID: 'home-share',
    hint: 'Pick recipes and share them as a PDF by email, text, Drive and more',
    gate: 'pdfExport',
  },
  { label: 'Add Recipe', href: '/add', testID: 'add-recipe-button', hint: 'Type one in or import from a link' },
  {
    label: 'What can I make with my existing pantry?',
    href: '/pantry-match',
    testID: 'home-pantry-match',
    hint: 'Recipes ranked by what you have on hand',
    gate: 'pantry',
  },
];

export default function RecipesHomeScreen() {
  const bottomInset = useBottomInset();
  const styles = useStyles();
  const shareOk = useFeature('pdfExport').available;
  const pantryOk = useFeature('pantry').available;
  const allowed = (gate?: FeatureId) => (gate === 'pdfExport' ? shareOk : gate === 'pantry' ? pantryOk : true);
  return (
    <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: 16 + bottomInset }]} testID="recipes-home">
      <MaxWidthContainer maxWidth={MAX_CONTENT_WIDTH.form}>
        <View style={styles.actions}>
          {ACTIONS.filter((a) => allowed(a.gate)).map((a) => (
            <Pressable
              key={a.testID}
              accessibilityRole="button"
              accessibilityHint={a.hint}
              style={({ pressed }) => [styles.button, pressed && styles.pressed]}
              onPress={() => router.push(a.href)}
              testID={a.testID}>
              <Text style={styles.label}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      </MaxWidthContainer>
    </ScrollView>
  );
}

// v1.0.2 (Jason): no cards — each option is its title as tappable green text (the selected-tab color),
// with a 56dp tap target and comfortable spacing.
const useStyles = makeStyles((colors) => ({
  scroll: { padding: 16, flexGrow: 1 },
  actions: { gap: 8 },
  button: { minHeight: 56, justifyContent: 'center', paddingHorizontal: 4, paddingVertical: 12 },
  pressed: { opacity: 0.6 },
  label: { color: colors.primary, fontSize: 20, fontWeight: '700' },
}));
