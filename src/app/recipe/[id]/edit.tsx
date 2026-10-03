import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { RecipeEditor } from '@/components/recipe-editor';
import { MaxWidthContainer, MAX_CONTENT_WIDTH } from '@/components/layout';
import { colors } from '@/lib/theme';
import { recipeStore } from '@/storage/recipes';
import type { Recipe } from '@/types/recipe';

/** Edit every recipe field, including ingredients and steps (spec #2, #6, #7). */
export default function EditRecipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [recipe, setRecipe] = useState<Recipe | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    recipeStore.get(String(id)).then((found) => {
      if (active) setRecipe(found ?? null);
    });
    return () => {
      active = false;
    };
  }, [id]);

  return (
    <MaxWidthContainer maxWidth={MAX_CONTENT_WIDTH.form}>
      <Stack.Screen options={{ title: recipe?.title ? `Edit ${recipe.title}` : 'Edit recipe' }} />
      {recipe === undefined ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : recipe === null ? (
        <View style={styles.center}>
          <Text style={styles.missing}>Recipe not found.</Text>
        </View>
      ) : (
        <RecipeEditor recipe={recipe} onSaved={() => router.back()} />
      )}
    </MaxWidthContainer>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  missing: { color: colors.muted, fontSize: 16 },
});
