import { router, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { MAX_CONTENT_WIDTH, MaxWidthContainer } from '@/components/layout';
import type { FeatureId } from '@/entitlements';
import { useFeature } from '@/hooks/use-feature';
import { colors } from '@/lib/theme';

interface HomeAction {
  label: string;
  href: Href;
  testID: string;
  hint: string;
  /** Optional feature behind the button: a LOCKED feature hides it quietly (paywall-ready gating). */
  gate?: FeatureId;
}

/**
 * Recipes tab (v1.0.1): five clear buttons, each opening existing functionality. RECIPES ARE THE CORE: no
 * onboarding, no sign-in; the app opens here.
 * - Search / Existing Recipes → `recipes.tsx` (keyword search, filters, list)
 * - Share Recipes → household sharing (`household.tsx`; gated, shows a neutral message when locked)
 * - Add Recipe → `add.tsx` (which links to import from a link / text)
 * - What can I make… → `pantry-match.tsx` (explains gently when the optional pantry is hidden or empty)
 * Share and pantry-match disappear quietly when their feature is LOCKED by the gate (never in v1: all free).
 */
const ACTIONS: HomeAction[] = [
  { label: 'Search', href: '/recipes?focus=search', testID: 'home-search', hint: 'Find a recipe by title, ingredient, note or tag' },
  { label: 'Existing Recipes', href: '/recipes', testID: 'home-existing', hint: 'Browse, filter and open your recipes' },
  { label: 'Share Recipes', href: '/household', testID: 'home-share', hint: 'Share recipes with your household', gate: 'householdSync' },
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
  const shareOk = useFeature('householdSync').available;
  const pantryOk = useFeature('pantry').available;
  const allowed = (gate?: FeatureId) =>
    gate === 'householdSync' ? shareOk : gate === 'pantry' ? pantryOk : true;
  return (
    <ScrollView contentContainerStyle={styles.scroll} testID="recipes-home">
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
              <Text style={styles.hint}>{a.hint}</Text>
            </Pressable>
          ))}
        </View>
      </MaxWidthContainer>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, flexGrow: 1 },
  actions: { gap: 12 },
  button: {
    minHeight: 64,
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  pressed: { borderColor: colors.primary },
  label: { color: colors.text, fontSize: 18, fontWeight: '700' },
  hint: { color: colors.muted, marginTop: 4 },
});
