import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { MAX_CONTENT_WIDTH, MaxWidthContainer } from '@/components/layout';
import { useFeature, useFeatureVisible } from '@/hooks/use-feature';
import { useOnDataChange } from '@/hooks/use-on-data-change';
import { rankRecipesByPantry, type PantryMatch } from '@/lib/pantry';
import { colors } from '@/lib/theme';
import { pantryStore } from '@/storage/pantry';
import { recipeStore } from '@/storage/recipes';

/**
 * "What can I make with my existing pantry?" (spec #21; moved from the Pantry tab to a Recipes-tab button in
 * v1.0.1). Recipes ranked by ingredients on hand via `rankRecipesByPantry` / `isInPantry`. The pantry is
 * optional: when it is locked, hidden in Settings or empty, this explains gently instead of nagging.
 */
export default function PantryMatchScreen() {
  const gate = useFeature('pantry');
  const visible = useFeatureVisible('pantry');
  const [state, setState] = useState<{ pantryCount: number; matches: PantryMatch[] } | null>(null);

  const load = useCallback(async () => {
    const [pantry, recipes] = await Promise.all([pantryStore.list(), recipeStore.list()]);
    setState({
      pantryCount: pantry.length,
      matches: rankRecipesByPantry(recipes, pantry).filter((m) => m.have > 0),
    });
  }, []);
  useFocusEffect(
    useCallback(() => {
      if (visible) void load().catch(() => undefined);
    }, [load, visible]),
  );
  useOnDataChange(() => {
    if (visible) void load().catch(() => undefined);
  });

  let body;
  if (!gate.available || !visible) {
    body = (
      <Text style={styles.muted} testID="pantry-match-off">
        This uses the optional Pantry, which is turned off. You can turn it on any time in Settings → Optional
        features; your recipes work the same either way.
      </Text>
    );
  } else if (!state) {
    body = <ActivityIndicator color={colors.primary} />;
  } else if (state.pantryCount === 0) {
    body = (
      <Text style={styles.muted} testID="pantry-match-empty">
        Your pantry is empty. Add what you have on hand in the Pantry tab and recipes you can make will show up
        here.
      </Text>
    );
  } else if (state.matches.length === 0) {
    body = (
      <Text style={styles.muted} testID="pantry-match-none">
        None of your recipes use what’s on hand yet.
      </Text>
    );
  } else {
    body = state.matches.map((match) => (
      <Pressable
        key={match.recipe.id}
        accessibilityRole="button"
        style={styles.card}
        testID={`pantry-suggestion-${match.recipe.id}`}
        onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: match.recipe.id } })}>
        <Text style={styles.title}>{match.recipe.title}</Text>
        <Text style={styles.muted}>
          {match.have} of {match.total} on hand
          {match.missing.length > 0 ? ` · missing ${match.missing.slice(0, 3).join(', ')}` : ''}
        </Text>
      </Pressable>
    ));
  }

  return (
    <View style={styles.fill} testID="pantry-match">
      <MaxWidthContainer maxWidth={MAX_CONTENT_WIDTH.text}>
        <ScrollView contentContainerStyle={styles.list} testID="pantry-suggestions">
          {body}
        </ScrollView>
      </MaxWidthContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.background },
  list: { padding: 16, gap: 10 },
  card: { backgroundColor: colors.card, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: colors.border, minHeight: 44 },
  title: { color: colors.text, fontSize: 16, fontWeight: '600' },
  muted: { color: colors.muted, marginTop: 2, fontSize: 15 },
});
