import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';

import { MaxWidthContainer } from '@/components/layout';
import { RecipeDetail } from '@/components/recipe-detail';
import { useFeature } from '@/hooks/use-feature';
import { recipeStore } from '@/storage/recipes';
import type { Category } from '@/types/recipe';

/** Compact-width recipe detail route. In medium/expanded the Recipes tab shows RecipeDetail in a side pane. */
export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [title, setTitle] = useState('Recipe');
  const [categories, setCategories] = useState<Category[]>([]);
  const categoriesOn = useFeature('categories').available;

  useFocusEffect(
    useCallback(() => {
      if (!categoriesOn) return;
      let active = true;
      recipeStore.listCategories().then((list) => {
        if (active) setCategories(list);
      });
      return () => {
        active = false;
      };
    }, [categoriesOn]),
  );

  return (
    <MaxWidthContainer>
      <Stack.Screen options={{ title }} />
      <RecipeDetail
        id={String(id)}
        categories={categories}
        onChange={(r) => setTitle(r.title)}
        onDeleted={() => router.back()}
      />
    </MaxWidthContainer>
  );
}
