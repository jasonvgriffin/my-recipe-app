import { RecipeList } from '@/components/recipe-list';

/**
 * Recipes tab. RECIPES ARE THE CORE: the app opens straight to the recipe list with the search bar at the top
 * (v1.0.4: the five-link Recipes home page is gone). Its other actions live in the center + menu
 * (`src/lib/add-menu.ts`): Add Recipe, Share Recipes (PDF, gate `pdfExport`), What Can I Make? (pantry).
 */
export default function RecipesTabScreen() {
  return <RecipeList />;
}
