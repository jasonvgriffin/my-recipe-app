# Already-built inventory

> **Update this file in every PR that adds or changes a feature.** Before building anything, read this
> file, `docs/SPEC.md`, and search the codebase. If something similar exists, extend it. Do not add a
> second helper, component, store, hook, or screen for the same job.
>
> Generated Oct 3 2026 from `main` after PRs #1–#6, the nutrition removal (#8), and the duplicate cleanup.
> Paths are relative to the repo root. `@/` = `src/`.

## Features by SPEC number

| #  | Feature | Implemented in |
|----|---------|----------------|
| 1  | Link import (URL / share sheet / pasted text) | `src/import/` (`importRecipe` in `import-recipe.ts`, `url.ts`, `html.ts`, `normalize.ts`, `parsers/json-ld.ts`, `parsers/heuristics.ts`, `parsers/text.ts`, `types.ts` zod schema, `deep-link.ts` `parseImportDeepLink` / `shareTextToImportInput`, `app-deps.ts`), `src/app/import.tsx`, `src/app/+native-intent.ts`, `src/lib/import-messages.ts`. Contract: `docs/IMPORT_API.md` |
| 2  | In-app editing of everything | `src/app/recipe/[id]/edit.tsx`, `src/components/recipe-editor.tsx`, `src/lib/recipe-edit.ts` (`applyRecipeEdit`), `src/app/add.tsx` |
| 3  | Custom categories | `src/storage/recipes.ts` (`addCategory` / `renameCategory` / `removeCategory`), `src/app/organize.tsx`, `src/components/category-chips.tsx`, `Category` / `categoryIds` in `src/types/recipe.ts` |
| 4  | Optional photo per recipe | `src/lib/photos.ts` (pick / persist / download / delete), `src/lib/photo-path.ts` (pure path helpers), the photo section of `recipe-editor.tsx` |
| 5  | Keep the original source link | `Recipe.sourceUrl` (`src/types/recipe.ts`), set by `importRecipe`, shown in `recipe-detail.tsx` |
| 6  | Free-text notes | `Recipe.notes`, `recipe-editor.tsx`, `recipe-detail.tsx` |
| 7  | Custom recipe titles | `recipe-editor.tsx`, `validateRecipe` in `src/types/recipe.ts` |
| 8  | Keyword search | `filterRecipes` in `src/lib/recipe-utils.ts`, the search box in `src/app/(tabs)/index.tsx` |
| 9  | Filters and sort | `filterRecipes` / `sortRecipes` (`recipe-utils.ts`), `src/components/recipe-filters.tsx`, saved browse state in `src/storage/settings.ts` |
| 10 | Cooked toggle and cook history | `setCooked` (`recipe-utils.ts`), `formatCookedOn` (`src/lib/dates.ts`), `Recipe.cooked` / `cookHistory` |
| 11 | Meal planning tab | `src/app/(tabs)/meal-plan.tsx`, `src/app/meal-plan/[date].tsx`, `src/components/meal-calendar.tsx`, `src/components/day-plan.tsx`, `src/storage/meal-plan.ts`, `src/types/meal-plan.ts`, date helpers in `src/lib/dates.ts` |
| 12 | Shopping list | `src/lib/shopping.ts` (`compileItems`, `compileWeekShoppingList`, `reconcileShoppingList`, …), `src/app/(tabs)/shopping.tsx`, `src/components/shopping-list-view.tsx`, `src/components/pantry-on-hand.tsx` |
| 13 | Dark theme | `src/lib/theme.ts` (`colors`). Use it; do not hard-code colors |
| 14 | Share button | `src/lib/share-recipe.ts` (`formatRecipeShareText`, `buildShareRequest`), `src/lib/present-share.ts`, `src/components/share-recipe-panel.tsx`, `modules/recipe-share/` (Android native) |
| 15 | Step timers | `detectStepDuration` / `formatDuration` (`src/lib/timers.ts`), timers inside `src/cooking/session.ts`, `src/notifications/step-timers.ts` (OS notifications) |
| 16 | Unit conversion and scaling | `src/lib/units.ts`, `src/lib/ingredients.ts` (`parseIngredient`, `convertIngredient`, `formatQuantity`, `ingredientKey`), `src/components/servings-units.tsx` |
| 17 | ~~Nutrition~~: **removed** (recipe app, not a nutrition app). Do not re-add without Jason asking | none |
| 18 | Grocery run mode | `src/app/grocery-run.tsx`, `src/components/grocery-run-view.tsx`, `src/lib/aisles.ts` (`aisleForIngredient`), `groupByAisle` in `src/lib/shopping.ts` |
| 19 | Cooking mode | `src/app/cook/[action].tsx`, `src/components/cooking-mode.tsx`, driven by `src/cooking/session.ts` |
| 20 | Tags | `parseTags` (`recipe-utils.ts`), `src/components/tag-editor.tsx`, tag management in `src/app/organize.tsx` |
| 21 | Pantry tracker (name + quantity + optional unit only) | `src/app/(tabs)/pantry.tsx`, `src/storage/pantry.ts`, `src/pantry/isInPantry.ts` (**the** ingredient↔pantry matcher), `src/pantry/match.ts` (`createPantryMatcher`: gated, storage-bound), `src/pantry/index.ts` (app bindings: `pantryMatcher`, `barcodeLookup`), `rankRecipesByPantry` (`src/lib/pantry.ts`) |
| 22 | Five-star ratings | `src/components/star-rating.tsx`, `Recipe.rating`, the rating filter in `recipe-filters.tsx` |
| 23 | Foldables / responsive | `src/hooks/use-window-size-class.ts`, `src/components/layout.tsx` (`TwoPaneLayout`, `MaxWidthContainer`, `MAX_CONTENT_WIDTH`) |
| 24 | Cook-with-me voice mode (no in-app TTS) | `src/cooking/session.ts`, `src/cooking/deep-link.ts` (`parseCookDeepLink`, `runCookCommand`), `src/cooking/index.ts`. Contract: `docs/COOK_API.md` |
| 25 | Household sharing (Supabase) | `src/sync/` (`engine.ts`, `coordinator.ts`, `account.ts`, `supabase.ts`, `rows.ts`, `config.ts`, `status.ts`, `authors.ts`, `auth-url.ts`, `errors.ts`), `src/household/` (`runtime.ts`, `state.ts`), `src/hooks/use-household.ts`, `src/hooks/use-household-sync.ts`, `src/app/household.tsx`, `src/components/shared-by.tsx`, `src/components/sync-status.tsx`, `src/storage/identity.ts`, `supabase/migrations/*`, `.github/workflows/supabase-migrations.yml`. Contract: `docs/SYNC.md` |
| 26 | Receipt scanning | `src/receipts/` (`ocr.ts`, `parseReceipt.ts`, `match.ts` receipt-line→pantry fuzzy match, `apply.ts`, `types.ts`), `src/storage/receipt-aliases.ts`, `src/app/pantry/receipt.tsx`, `modules/mlkit-text-recognition/` |
| 27 | Barcode scanning (Open Food Facts for the **name only**) | `src/pantry/barcodeLookup.ts`, `src/app/pantry/scan.tsx`, `pantryStore.addScanned` |

## Shared libraries (reuse these)

| Job | Use | Notes |
|-----|-----|-------|
| Recipe type, validation, migration | `src/types/recipe.ts` (`Recipe`, `validateRecipe`, `isRecipe`, `migrateRecipe`, `RECIPE_SCHEMA_VERSION`, `PantryItem`, `slimPantryItem`) | Bump the schema version and add a migration step for shape changes |
| Create / normalize recipes | `createRecipe`, `normalizeIngredient`, `normalizeStep`, `parseTags` (`src/lib/recipe-utils.ts`) | |
| IDs | `uuid()` (`src/lib/ids.ts`) | Only ID generator |
| Dates | `src/lib/dates.ts` | Local time, never UTC slices |
| Ingredients and units | `src/lib/ingredients.ts`, `src/lib/units.ts` | `formatQuantity` for all number display |
| Key-value storage and collections | `src/storage/kv.ts` (`createCollection`, `defaultStore`) | Every store builds on this |
| Stores | `recipeStore` (`src/storage/recipes.ts`, incl. coalesced `seedIfNeeded`), `mealPlanStore`, `pantryStore`, `settingsStore`, receipt aliases | One store per data type |
| Change notifications | `src/storage/writes.ts` (`notifyDataChange`, `onDataChange`, `withoutSyncNotify`), `src/hooks/use-on-data-change.ts` | Screens reload through `useOnDataChange` |
| Settings | `src/storage/settings.ts`, `src/hooks/use-settings.ts` | Feature visibility lives in `settings.features` |
| Entitlements / paywall-ready gating | `src/entitlements/` (`features.ts` flags, `gate.ts`, `provider.ts`, `canUse`), `src/hooks/use-feature.ts` (`useFeature`, `useFeatureVisible`), `src/components/feature-gate.tsx` (`FeatureLocked`), `src/components/optional-feature.tsx` | Gate every optional feature through these |
| Import | `importRecipe` (`src/import`) | The only import pipeline (UI, share sheet, future MCP) |
| Cooking state | `src/cooking/session.ts` | UI, deep links and future MCP all drive this |
| Sync | `src/sync`, `src/household` | |
| UI primitives | `Chip` (`src/components/chip.tsx`), `CategoryChips`, `TagEditor`, `StarRating`, `TwoPaneLayout` / `MaxWidthContainer` | Do not style ad-hoc chips |
| Theme | `src/lib/theme.ts` | |
| Sample data | `src/data/seed.ts` (via `recipeStore.seedIfNeeded`) | |

## Build and release

- `app.json` (icon config by Eve: no `ios.icon`, adaptive background `#16211A`), config plugins in `modules/*/app.plugin.js` and `plugins/with-release-signing.js` (PR #7).
- `.github/workflows/android.yml`: typecheck, lint, jest, prebuild, release APK signed with the release keystore from repo secrets.
- Tests: `__tests__/` (jest-expo). Jest `testTimeout` is 20 s; screen-heavy suites load routes in `beforeAll`.
