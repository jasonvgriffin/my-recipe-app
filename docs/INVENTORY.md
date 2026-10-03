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
| 1  | Link import (URL / share sheet / pasted text) | `src/import/` (`importRecipe` in `import-recipe.ts`, `url.ts`, `html.ts`, `normalize.ts`, `parsers/json-ld.ts`, `parsers/heuristics.ts`, `parsers/text.ts`, `types.ts` zod schema, `deep-link.ts` `parseImportDeepLink` / `shareTextToImportInput`, `app-deps.ts`), `src/app/import.tsx` (“Import link” saves directly since v1.0.1; text/share/deep link show a draft), `src/app/+native-intent.ts`, `src/lib/import-messages.ts`. Contract: `docs/IMPORT_API.md` |
| 2  | In-app editing of everything | `src/app/recipe/[id]/edit.tsx`, `src/components/recipe-editor.tsx`, `src/lib/recipe-edit.ts` (`applyRecipeEdit`), `src/app/add.tsx` |
| 3  | Custom categories | `src/storage/recipes.ts` (`addCategory` / `renameCategory` / `removeCategory`), `src/app/organize.tsx`, `src/components/category-chips.tsx`, `Category` / `categoryIds` in `src/types/recipe.ts` |
| 4  | Optional photo per recipe | `src/lib/photos.ts` (pick / persist / download / delete), `src/lib/photo-path.ts` (pure path helpers), the photo section of `recipe-editor.tsx` |
| 5  | Keep the original source link | `Recipe.sourceUrl` (`src/types/recipe.ts`), set by `importRecipe`, shown in `recipe-detail.tsx` |
| 6  | Free-text notes | `Recipe.notes`, `recipe-editor.tsx`, `recipe-detail.tsx` |
| 7  | Custom recipe titles | `recipe-editor.tsx`, `validateRecipe` in `src/types/recipe.ts` |
| 8  | Keyword search | `filterRecipes` in `src/lib/recipe-utils.ts`, the search box in `src/app/recipes.tsx` (Existing Recipes; the Recipes tab's “Search” button opens it with `?focus=search`) |
| 9  | Filters and sort | `filterRecipes` / `sortRecipes` / `browseFilters` (`recipe-utils.ts`; “cooked recently” = fixed `COOKED_RECENTLY_DAYS` = 14 since v1.0.2, no setting), `src/components/recipe-filters.tsx`, saved browse state in `src/storage/settings.ts` |
| 10 | Cooked toggle and cook history | `setCooked` (`recipe-utils.ts`), `formatCookedOn` (`src/lib/dates.ts`), `Recipe.cooked` / `cookHistory` |
| 11 | Meal planning tab (month view only since v1.0.1) | `src/app/(tabs)/meal-plan.tsx`, `src/app/meal-plan/[date].tsx`, `src/components/meal-calendar.tsx` (muted “Tap a day to add meal plan” hint left of Today since v1.0.3), `src/components/day-plan.tsx`, `src/storage/meal-plan.ts`, `src/types/meal-plan.ts`, date helpers in `src/lib/dates.ts` |
| 12 | Shopping list | `src/lib/shopping.ts` (`compileItems`, `compileWeekShoppingList`, `reconcileShoppingList`, …), `src/app/(tabs)/shopping.tsx`, `src/components/shopping-list-view.tsx`, `src/components/pantry-on-hand.tsx`, barcode scan to add a line: `src/app/shopping/scan.tsx` (shared `BarcodeScanner`), opened by the full-width outlined “Scan Item” button above “or” and the Add an item row (v1.0.3; button and “or” absent when `barcodeScan` is locked/hidden) |
| 13 | Dark theme | `src/lib/theme.ts` (`colors`). Use it; do not hard-code colors |
| 14 | Share button | `src/lib/share-recipe.ts` (`formatRecipeShareText`, `buildShareRequest`), `src/lib/present-share.ts`, `src/components/share-recipe-panel.tsx`, `modules/recipe-share/` (Android native) |
| 15 | Step timers | `detectStepDuration` / `formatDuration` (`src/lib/timers.ts`), timers inside `src/cooking/session.ts`, `src/notifications/step-timers.ts` (OS notifications) |
| 16 | Unit conversion and scaling | `src/lib/units.ts`, `src/lib/ingredients.ts` (`parseIngredient`, `convertIngredient`, `formatQuantity`, `ingredientKey`), `src/components/servings-units.tsx` |
| 17 | ~~Nutrition~~: **removed** (recipe app, not a nutrition app). Do not re-add without Jason asking | none |
| 18 | Grocery run mode | `src/app/grocery-run.tsx`, `src/components/grocery-run-view.tsx`, `src/lib/aisles.ts` (`aisleForIngredient`), `groupByAisle` in `src/lib/shopping.ts` |
| 19 | Cooking mode | `src/app/cook/[action].tsx`, `src/components/cooking-mode.tsx`, driven by `src/cooking/session.ts` |
| 20 | Tags | `parseTags` (`recipe-utils.ts`), `src/components/tag-editor.tsx`, tag management in `src/app/organize.tsx` |
| 21 | Pantry tracker (name, quantity, unit + optional category, expiration date, brand; no nutrition) | `src/app/(tabs)/pantry.tsx` (form, category filter + expiry sort via shared `Chip`; no suggestions pane since v1.0.1), `src/app/pantry-match.tsx` (“What can I make with my existing pantry?”, opened from the Recipes tab; uses `rankRecipesByPantry`), `src/storage/pantry.ts`, `src/pantry/isInPantry.ts` (**the** ingredient↔pantry matcher), `src/pantry/match.ts` (`createPantryMatcher`: gated, storage-bound), `src/pantry/index.ts` (app bindings: `pantryMatcher`, `barcodeLookup`), `rankRecipesByPantry`, `PANTRY_CATEGORIES`, `expiryState`, `pantryCategories`, `filterSortPantry` (`src/lib/pantry.ts`), `slimPantryItem` (drops legacy nutrition only) in `src/types/recipe.ts` |
| 22 | Five-star ratings | `src/components/star-rating.tsx`, `Recipe.rating`, the rating filter in `recipe-filters.tsx` |
| 23 | Foldables / responsive | `src/hooks/use-window-size-class.ts`, `src/components/layout.tsx` (`TwoPaneLayout`, `MaxWidthContainer`, `MAX_CONTENT_WIDTH`) |
| 24 | Cook-with-me voice mode (no in-app TTS) | `src/cooking/session.ts`, `src/cooking/deep-link.ts` (`parseCookDeepLink`, `runCookCommand`), `src/cooking/index.ts`. Contract: `docs/COOK_API.md` |
| 25 | Household sharing (Supabase) | `src/sync/` (`engine.ts`, `coordinator.ts`, `account.ts`, `supabase.ts`, `rows.ts`, `config.ts`, `status.ts`, `authors.ts`, `auth-url.ts`, `errors.ts`), `src/household/` (`runtime.ts`, `state.ts`), `src/hooks/use-household.ts`, `src/hooks/use-household-sync.ts`, `src/hooks/use-incoming-url.ts`, `src/app/household.tsx`, `src/app/auth.tsx` (magic-link redirect `myrecipeapp://auth`), `src/components/shared-by.tsx`, `src/components/sync-status.tsx`, `src/storage/identity.ts`, `supabase/migrations/*`, `.github/workflows/supabase-migrations.yml`. Contract: `docs/SYNC.md` |
| 26 | ~~Receipt scanning~~: **removed in v1.0.1**. Do not re-add without Jason asking (the unused Supabase `receipt_aliases` table stays; never edit applied migrations) | none |
| 27 | Barcode scanning (Open Food Facts for the **name and brand only**), pantry **and** shopping list | `src/components/barcode-scanner.tsx` (**the** scanner: camera, lookup, name-once), `src/pantry/barcodeLookup.ts`, `src/app/pantry/scan.tsx` (→ `pantryStore.addScanned`, back to Pantry with `?added=`), `src/app/shopping/scan.tsx` (→ `addManualItem`, back to Shopping with `?added=`). Product name is the item title (brand secondary) |
| 28 | AI assistant access (remote MCP server) | Settings → “AI assistants (MCP)” shows `MCP_SERVER_URL` (`src/config/index.ts`) with a copy button; `src/mcp/` (`server.ts` HTTP/resource metadata/consent backend/JSON-RPC, `tools.ts` tools on top of `importRecipeWith` / `applyRecipeEdit` / `filterRecipes` / `compileWeekShoppingList` / `addManualItem` / `isInPantry`, `repo.ts` synced tables via `src/sync/rows.ts`, `oauth.ts` (Supabase Auth is the OAuth server), `rate-limit.ts`), `supabase/functions/mcp/` (Edge Function binding), `site/oauth/consent.html` + `.github/workflows/pages.yml` (OAuth consent page on GitHub Pages), `supabase/migrations/20261003030000_mcp_rate_limits.sql`, `.github/workflows/supabase-functions.yml`. Docs: `docs/MCP.md` |

## Navigation (v1.0.2)

| Piece | Where |
|-------|-------|
| Bottom bar: Recipes · Meal Plan · **+** · Shopping · More (nav rail on expanded) | `src/app/(tabs)/_layout.tsx`. Meal Plan / Shopping drop out (`href: null`) when locked or hidden in Settings; + and More always stay. Pantry route stays in `(tabs)` (`href: null`), opened from More |
| Center + button → add sheet (3-column round icon grid) | `PlusTabButton` in `(tabs)/_layout.tsx` (placeholder route `src/app/(tabs)/add-menu.tsx` redirects to `/`), `src/components/add-menu-sheet.tsx` (Modal; backdrop / back closes), items + filtering + routes in `src/lib/add-menu.ts` (`ADD_MENU_ITEMS`, `visibleAddMenuItems`, `addMenuHref`). Add a menu action there, never a second menu. v1.0.3: the `plan-meal` item is labeled “Meal Plan”, the Scan Barcode item is gone (scan from the Shopping / Pantry screens), and a partial last grid row is centered |
| More screen: Pantry (if visible), Household (if unlocked), Settings | `src/app/(tabs)/more.tsx` |
| Header “My Recipe App” + section name, settings gear right | `src/components/app-header.tsx` (`AppHeaderTitle`, `SettingsGearButton`), used by `(tabs)/_layout.tsx` and the Settings / Household screens in `src/app/_layout.tsx` |
| App constants (MCP server URL) and app version | `src/config/index.ts` (`MCP_SERVER_URL`, `appVersion()` from expo-constants); version shown at the bottom of Settings |
| Accent (orange) for the + button | `colors.accent` / `accentText` in `src/lib/theme.ts` |

## Recipes tab (v1.0.1; plain green titles since v1.0.2)

| Button | Opens |
|--------|-------|
| Search / Existing Recipes | `src/app/recipes.tsx` (list, filters, two-pane detail) |
| Share Recipes | `src/app/household.tsx` (hidden when `householdSync` is locked) |
| Add Recipe | `src/app/add.tsx` (links to `src/app/import.tsx`) |
| What can I make with my existing pantry? | `src/app/pantry-match.tsx` (hidden when `pantry` is locked; explains when hidden/empty) |

Home screen: `src/app/(tabs)/index.tsx` — since v1.0.2 each option is just its title as tappable green text (`colors.primary`), no cards or subtitles (hint kept as `accessibilityHint`). Settings gear: `SettingsGearButton` (`src/components/app-header.tsx`).

## Shared libraries (reuse these)

| Job | Use | Notes |
|-----|-----|-------|
| Recipe type, validation, migration | `src/types/recipe.ts` (`Recipe`, `validateRecipe`, `isRecipe`, `migrateRecipe`, `RECIPE_SCHEMA_VERSION`, `PantryItem`, `slimPantryItem`) | Bump the schema version and add a migration step for shape changes |
| Create / normalize recipes | `createRecipe`, `normalizeIngredient`, `normalizeStep`, `parseTags` (`src/lib/recipe-utils.ts`) | |
| IDs | `uuid()` (`src/lib/ids.ts`) | Only ID generator |
| Dates | `src/lib/dates.ts` | Local time, never UTC slices |
| Ingredients and units | `src/lib/ingredients.ts`, `src/lib/units.ts` | `formatQuantity` for all number display |
| Key-value storage and collections | `src/storage/kv.ts` (`createCollection`, `defaultStore`) | Every store builds on this |
| Stores | `recipeStore` (`src/storage/recipes.ts`, incl. coalesced one-time `removeUntouchedSamples`), `mealPlanStore`, `pantryStore`, `settingsStore` | One store per data type |
| Change notifications | `src/storage/writes.ts` (`notifyDataChange`, `onDataChange`, `withoutSyncNotify`), `src/hooks/use-on-data-change.ts` | Screens reload through `useOnDataChange` |
| Settings | `src/storage/settings.ts`, `src/hooks/use-settings.ts` | Feature visibility lives in `settings.features` (the old `cookedRecentlyDays` setting was removed in v1.0.2 and is dropped from stored data) |
| Entitlements / paywall-ready gating | `src/entitlements/` (`features.ts` flags, `gate.ts`, `provider.ts`, `canUse`), `src/hooks/use-feature.ts` (`useFeature`, `useFeatureVisible`), `src/components/feature-gate.tsx` (`FeatureLocked`), `src/components/optional-feature.tsx` | Gate every optional feature through these |
| Import | `importRecipe` (`src/import`) | The only import pipeline (UI, share sheet, future MCP) |
| Cooking state | `src/cooking/session.ts` | UI, deep links and future MCP all drive this |
| Sync | `src/sync`, `src/household` | |
| UI primitives | `Chip` (`src/components/chip.tsx`), `CategoryChips`, `TagEditor`, `StarRating`, `TwoPaneLayout` / `MaxWidthContainer` | Do not style ad-hoc chips |
| Theme | `src/lib/theme.ts` | |
| Sample data | None in the app (v1.0.1). `src/storage/legacy-samples.ts` only identifies untouched v1.0.0 samples to delete. Test fixtures: `test-helpers/sample-recipes.ts` (`SAMPLE_RECIPES`, `addSampleRecipes`, `asLegacySample`) | |

## Build and release

- `app.json` (icon config by Eve: no `ios.icon`, adaptive background `#16211A`), config plugins in `modules/*/app.plugin.js` and `plugins/with-release-signing.js` (PR #7).
- `.github/workflows/android.yml`: typecheck, lint, jest, prebuild, release APK signed with the release keystore from repo secrets (v1 + v2 + v3 schemes, `plugins/with-release-signing.js`), then `apksigner` scheme check, `zipalign -c -P 16 4`, and a blocked-permission check.
- Android permissions: `app.json` `android.permissions` (VIBRATE) + `android.blockedPermissions` (storage, overlay, exact alarms, Bluetooth / nearby devices, launcher badges, install referrer, FCM receive). Keep that list in sync with the CI grep.
- Tests: `__tests__/` (jest-expo). Jest `testTimeout` is 20 s; screen-heavy suites load routes in `beforeAll`.
