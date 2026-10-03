import { RecipeList } from '@/components/recipe-list';

/**
 * Stack route for the recipe list (deep links from the + menu): `/recipes?focus=search` and `/recipes?select=pdf`.
 * The Recipes tab (`(tabs)/index.tsx`) renders the same `RecipeList`.
 */
export default function RecipesRoute() {
  return <RecipeList />;
}
