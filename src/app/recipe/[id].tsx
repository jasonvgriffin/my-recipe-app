import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { MaxWidthContainer } from '@/components/layout';
import { RecipeDetail } from '@/components/recipe-detail';

/** Compact-width recipe detail route. In medium/expanded the Recipes tab shows RecipeDetail in a side pane. */
export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [title, setTitle] = useState('Recipe');
  return (
    <MaxWidthContainer>
      <Stack.Screen options={{ title }} />
      <RecipeDetail id={String(id)} onChange={(r) => setTitle(r.title)} onDeleted={() => router.back()} />
    </MaxWidthContainer>
  );
}
