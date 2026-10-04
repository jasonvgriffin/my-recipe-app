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
| 3  | Custom categories (v1.0.5: the Recipes tab opens grouped by category; v1.0.6: several per recipe) | `src/storage/recipes.ts` (`addCategory` / `renameCategory` (rejects duplicates: `DuplicateCategoryError`) / `removeCategory` (recipes → Uncategorized) / `prepareCategories` (seeds Breakfast, Lunch, Dinner once per device + `mergeDuplicateCategories` after household sync)), `src/components/recipe-categories.tsx` (collapsible categories with rename / delete (confirm) / New category, recipe names + stars, Uncategorized when non-empty), `src/components/category-chips.tsx` (v1.0.6: multi-select chips with ✓ + `toggleCategoryId`; Uncategorized is an automatic hint, not a chip), `groupRecipesByCategory` (a recipe appears under each of its categories) / `sortCategories` / `setRecipeCategories` / `toggleRecipeCategory` / `primaryCategoryId` (`src/lib/recipe-utils.ts`), `Category.sortOrder`, `DEFAULT_CATEGORY_NAMES`, `UNCATEGORIZED_LABEL`, `categoryIds` in `src/types/recipe.ts`; DB: `supabase/migrations/20261004000000_recipe_categories.sql` (`categories.sort_order`, `recipes.category_ids` mirrors). The “Manage categories & tags” screen (`organize.tsx`) was removed in v1.0.5 |
| 4  | Optional photo per recipe | `src/lib/photos.ts` (pick / persist / download / delete), `src/lib/photo-path.ts` (pure path helpers), the photo section of `recipe-editor.tsx` |
| 5  | Keep the original source link | `Recipe.sourceUrl` (`src/types/recipe.ts`), set by `importRecipe`, shown in `recipe-detail.tsx` |
| 6  | Free-text notes | `Recipe.notes`, `recipe-editor.tsx`, `recipe-detail.tsx` |
| 7  | Custom recipe titles | `recipe-editor.tsx`, `validateRecipe` in `src/types/recipe.ts` |
| 8  | Keyword search | `filterRecipes` in `src/lib/recipe-utils.ts`, the search box in `src/components/recipe-list.tsx` (top of the Recipes tab; typing shows the flat list of matches; + menu “Search Recipes” opens `/recipes?focus=search`) |
| 9  | Filters and sort | `filterRecipes` / `sortRecipes` / `browseFilters` (`recipe-utils.ts`; “cooked recently” = fixed `COOKED_RECENTLY_DAYS` = 14 since v1.0.2, no setting), `src/components/recipe-filters.tsx` inside the “Advanced search” sheet `src/components/advanced-search-sheet.tsx` (v1.0.5: filter button beside the search box, dot when `isAdvancedSearchActive`, Reset = `resetAdvancedSearch`), saved browse state in `src/storage/settings.ts` |
| 10 | Cooked toggle and cook history | `setCooked` (`recipe-utils.ts`), `formatCookedOn` (`src/lib/dates.ts`), `Recipe.cooked` / `cookHistory` |
| 11 | Meal planning tab (month view only since v1.0.1) | `src/app/(tabs)/meal-plan.tsx`, `src/app/meal-plan/[date].tsx`, `src/components/meal-calendar.tsx` (muted “Tap a day to add meal plan” hint left of Today since v1.0.3), `src/components/day-plan.tsx`, `src/storage/meal-plan.ts`, `src/types/meal-plan.ts`, date helpers in `src/lib/dates.ts` |
| 12 | Shopping list | `src/lib/shopping.ts` (`compileItems`, `compileWeekShoppingList`, `reconcileShoppingList`, …), `src/app/(tabs)/shopping.tsx`, `src/components/shopping-list-view.tsx`, `src/components/pantry-on-hand.tsx`, barcode scan to add a line: `src/app/shopping/scan.tsx` (shared `BarcodeScanner`), opened by the full-width outlined “Scan Item” button. v1.0.5 order: the add box (`SHOPPING_ADD_PLACEHOLDER` “Type here & press Add”) + Add at the top, “or”, then Scan Item (absent when `barcodeScan` is locked/hidden), Build from Meal Plan, View Shopping List; the week selector stays above. v1.0.7: optional quantity + Notes on the add box (`SHOPPING_QTY_PLACEHOLDER` / `SHOPPING_NOTES_PLACEHOLDER`, plain labels), shown under each item and editable (pencil → inline editor; `ShoppingListItem.quantity` / `notes`, `addManualItem(…, details)`, `updateItemDetails`, `normalizeShoppingListItem` on load; kept on rebuild; also shown in grocery run) |
| 13 | Theme: dark / light / system + accent colors (Settings → Appearance, v1.0.3; 12 accents since v1.0.5) | Palettes + contrast helpers: `src/lib/theme.ts` (`buildColors`, `ACCENTS`, `THEME_MODES`, `resolveScheme`). Live theme: `src/hooks/use-theme.tsx` (`AppThemeProvider`, `useColors`, `makeStyles`, `useNavigationTheme`, `useColorSchemeResolved`). Saved in `AppSettings.appearance` (`src/storage/settings.ts`). UI: `AppearanceSection` in `src/app/settings.tsx`. Never hard-code colors (`__tests__/appearance.test.tsx`) |
| 14 | Share button + Export PDF (v1.0.3) | `src/lib/share-recipe.ts` (`formatRecipeShareText`, `buildShareRequest`), `src/lib/present-share.ts` (also shares PDF files), `src/components/share-recipe-panel.tsx`, `modules/recipe-share/` (Android native). PDF: `src/lib/recipe-pdf.ts` (pure HTML: `buildRecipesPdfHtml`, `pdfFileName`; no nutrition), `src/lib/export-pdf.ts` (`exportRecipesPdf`: expo-print → cache file → share sheet; gate `pdfExport`), `src/hooks/use-pdf-export.ts`; v1.0.7 Print: `printRecipesPdf` (same PDF → `Print.printAsync({ uri })`, Android print dialog), `usePdfExport().printPdf`, “Print” button beside “Share PDF” on Share recipes (`pdf-print-button`); entry points: recipe detail “Export PDF”, recipe list multi-select (`src/components/recipe-list.tsx`, `/recipes?select=pdf` from + menu “Share Recipes”; v1.0.5: no “Select recipes for PDF” link on the Recipes tab) |
| 15 | Step timers | `detectStepDuration` / `formatDuration` (`src/lib/timers.ts`), timers inside `src/cooking/session.ts`, `src/notifications/step-timers.ts` (OS notifications) |
| 16 | Unit conversion and scaling | `src/lib/units.ts`, `src/lib/ingredients.ts` (`parseIngredient`, `convertIngredient`, `formatQuantity`, `ingredientKey`), `src/components/servings-units.tsx` |
| 17 | ~~Nutrition~~: **removed** (recipe app, not a nutrition app). Do not re-add without Jason asking | none |
| 18 | Grocery run mode (user-facing name “Shopping List” since v1.0.4; its buttons read “View Shopping List” since v1.0.5) | `src/app/grocery-run.tsx`, `src/components/grocery-run-view.tsx`, `src/lib/aisles.ts` (`aisleForIngredient`), `groupByAisle` in `src/lib/shopping.ts` |
| 19 | Cooking mode | `src/app/cook/[action].tsx`, `src/components/cooking-mode.tsx`, driven by `src/cooking/session.ts` |
| 20 | Tags | `parseTags` (`recipe-utils.ts`), `src/components/tag-editor.tsx` (recipe detail and, since v1.0.5, the edit screen `recipe-editor.tsx`); add screen “Tags (comma separated)”; the tag filter is in Advanced search. Store `renameTag` / `deleteTag` remain (no UI since organize.tsx was removed in v1.0.5) |
| 21 | Pantry tracker (name, quantity, unit + optional category, expiration date, brand; no nutrition) | `src/app/(tabs)/pantry.tsx` (form, category filter + expiry sort via shared `Chip`; no suggestions pane since v1.0.1), `src/app/pantry-match.tsx` (“What can I make?”, opened from the + menu; uses `rankRecipesByPantry`), `src/storage/pantry.ts`, `src/pantry/isInPantry.ts` (**the** ingredient↔pantry matcher), `src/pantry/match.ts` (`createPantryMatcher`: gated, storage-bound), `src/pantry/index.ts` (app bindings: `pantryMatcher`, `barcodeLookup`), `rankRecipesByPantry`, `PANTRY_CATEGORIES`, `expiryState`, `pantryCategories`, `filterSortPantry` (`src/lib/pantry.ts`), `slimPantryItem` (drops legacy nutrition only) in `src/types/recipe.ts`. v1.0.7: optional plain `PantryItem.notes` (form “Notes (optional)”, shown on the card) |
| 22 | Five-star ratings | `src/components/star-rating.tsx`, `Recipe.rating`, the rating filter in `recipe-filters.tsx` (Advanced search), stars beside each recipe name in `recipe-categories.tsx` |
| 23 | Foldables / responsive | `src/hooks/use-window-size-class.ts`, `src/components/layout.tsx` (`TwoPaneLayout`, `MaxWidthContainer`, `MAX_CONTENT_WIDTH`) |
| 24 | Cook-with-me voice mode (no in-app TTS) | `src/cooking/session.ts`, `src/cooking/deep-link.ts` (`parseCookDeepLink`, `runCookCommand`), `src/cooking/index.ts`. Contract: `docs/COOK_API.md` |
| 25 | ~~Household sharing~~: **removed in v1.0.6** (Jason). Household rows were migrated to personal scope (`supabase/migrations/20261006000000_remove_household_sharing.sql`); old tables stay unused | none |
| 26 | ~~Receipt scanning~~: **removed in v1.0.1**. Do not re-add without Jason asking (the unused Supabase `receipt_aliases` table stays; never edit applied migrations) | none |
| 27 | Barcode scanning (Open Food Facts for the **name and brand only**), pantry **and** shopping list | `src/components/barcode-scanner.tsx` (**the** scanner: camera, lookup, name-once), `src/pantry/barcodeLookup.ts`, `src/app/pantry/scan.tsx` (v1.0.7: saves nothing — back to Pantry with `?scan&scanBarcode&scanName&scanBrand`, which opens the pre-filled Edit item form for review; `pantryStore.findScanned` picks the existing item (+1 package); `keepName` keeps the product name), `src/pantry/product-name.ts` (v1.0.7: `pickProductName` prefers OFF `product_name_en` / `product_name` / `abbreviated_product_name` over generic_name/categories; `tidyProductName` ALL-CAPS → title case incl. M&M's; `pickBrand`), `src/app/shopping/scan.tsx` (→ `addManualItem`, back to Shopping with `?added=`). Product name is the item title (brand secondary) |
| 28 | ~~AI assistant access (MCP server)~~: **cut in v1.0.6** (Jason; may be revisited). Code is in git history | none |
| 31 | Import PDF (v1.0.6) | `src/app/import-pdf.tsx` (pick → candidates → categories → Import N), `src/import/pdf/` (`inflate`, `objects`, `fonts`, `extract-text`, `recipes`, `index`: `readRecipesFromPdf` / `importPdfCandidates`), `src/lib/pdf-file.ts` (SAF picker / shared URI bytes), `sharedPdfUri` in `src/import/deep-link.ts`, `src/import/parsers/text.ts` |

## Navigation (v1.0.2)

| Piece | Where |
|-------|-------|
| Bottom bar: Recipes · Meal Plan · **+** · Shopping · More (nav rail on expanded) | `src/app/(tabs)/_layout.tsx`. Meal Plan / Shopping drop out (`href: null`) when locked or hidden in Settings; + and More always stay. Pantry route stays in `(tabs)` (`href: null`), opened from More |
| Center + button → add sheet (3-column round icon grid) | `PlusTabButton` in `(tabs)/_layout.tsx` (placeholder route `src/app/(tabs)/add-menu.tsx` redirects to `/`), `src/components/add-menu-sheet.tsx` (Modal; backdrop / back closes), items + filtering + routes in `src/lib/add-menu.ts` (`ADD_MENU_ITEMS`, `visibleAddMenuItems`, `addMenuHref`). Add a menu action there, never a second menu. v1.0.3: the `plan-meal` item is labeled “Meal Plan”, the Scan Barcode item is gone (scan from the Shopping / Pantry screens), and a partial last grid row is centered. v1.0.4: the + is 33% smaller (44dp raised / 39dp rail, 23dp glyph) and “Share Recipe” reads “Share Recipes”. v1.0.5: labels wrap (no `numberOfLines`), never “Add to Shopping Li…”. v1.0.7: the bar is ~33% bigger (`TAB_BAR` in `src/components/layout.tsx`: 80dp + safe-area inset, 29dp icons, 13sp labels, 58dp +); hides on keyboard |
| More screen: Pantry (if visible), Settings, Contact Us (v1.0.7) | `src/app/(tabs)/more.tsx`; Contact Us screen `src/app/contact.tsx` (text + mailto in `src/lib/contact.ts`) |
| Header “My Recipe App” (banner) + settings gear right; section name as a big page title below the banner (v1.0.4) | `src/components/app-header.tsx` (`AppHeaderTitle`, `SectionTitle`, `SectionLayout` via the navigators' `screenLayout`, `SettingsGearButton`), used by `(tabs)/_layout.tsx` and the Settings / Household screens in `src/app/_layout.tsx` |
| App version | `src/config/index.ts` (`appVersion()` from expo-constants); version shown at the bottom of Settings |
| Accent for the + button and + menu icons | `colors.accent` / `accentText` (orange with the Green accent, else the chosen accent; `src/lib/theme.ts`) |

## Recipes tab (v1.0.5: search row + categories)

`src/app/(tabs)/index.tsx` renders `RecipeList` (`src/components/recipe-list.tsx`): the search row (box + “Advanced
search” filter button → `AdvancedSearchSheet`), then `RecipeCategories` (Breakfast / Lunch / Dinner / … collapsible,
Uncategorized when non-empty, “New category”, “Add recipe” at the end of the list — no floating button over the list).
A search or filter shows the flat list of matches; two-pane detail on wide screens. No “Import from link” / “Select
recipes for PDF” links (both in the + menu). With `categories` locked the page is the flat list (core never gated). `src/app/recipes.tsx` renders the same
component as a stack route for + menu deep links. The old home actions are in the + menu (`src/lib/add-menu.ts`):

| + menu item | Opens |
|--------|-------|
| Add Recipe | `src/app/add.tsx` (links to `src/app/import.tsx`) |
| Import Link | `src/app/import.tsx` (needs `linkImport`) |
| Search Recipes | `/recipes?focus=search` |
| Share Recipes | `/recipes?select=pdf` — pick recipes → one PDF → share sheet (needs `pdfExport`). |
| What Can I Make? | `src/app/pantry-match.tsx` (needs `pantry`: gate + Settings toggle; the screen still explains when hidden/empty on a deep link) |

App icon (v1.0.5: yellow bowl `#FFD60A`): sources `assets/icons/*.svg`, PNGs `assets/images/*`, regenerate both with
`python3 assets/icons/make-icons.py`; Android mipmaps come from `expo prebuild` (app.json `icon` / `adaptiveIcon`).

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
| Theme | `src/lib/theme.ts` (palettes), `src/hooks/use-theme.tsx` (`makeStyles`, `useColors`) | No module-level `colors`; styles are per palette |
| Bottom safe area | `useBottomInset()` in `src/components/layout.tsx` (+ `BottomBarCoversInsetProvider` in `(tabs)/_layout.tsx`) | Add to the bottom padding of every scrolling stack screen / floating button |
| Durations in words | `formatDurationWords` (`src/lib/timers.ts`) | “20 min”, for print; `formatDuration` is the clock format |
| Sample data | None in the app (v1.0.1). `src/storage/legacy-samples.ts` only identifies untouched v1.0.0 samples to delete. Test fixtures: `test-helpers/sample-recipes.ts` (`SAMPLE_RECIPES`, `addSampleRecipes`, `asLegacySample`) | |

## Build and release

- `app.json` (icon config by Eve: no `ios.icon`, adaptive background `#16211A`), config plugins in `modules/*/app.plugin.js` and `plugins/with-release-signing.js` (PR #7).
- `.github/workflows/android.yml`: typecheck, lint, jest, prebuild, release APK signed with the release keystore from repo secrets (v1 + v2 + v3 schemes, `plugins/with-release-signing.js`), then `apksigner` scheme check, `zipalign -c -P 16 4`, and a blocked-permission check.
- Android permissions: `app.json` `android.permissions` (VIBRATE) + `android.blockedPermissions` (storage, overlay, exact alarms, Bluetooth / nearby devices, launcher badges, install referrer, FCM receive). Keep that list in sync with the CI grep.
- Tests: `__tests__/` (jest-expo). Jest `testTimeout` is 20 s; screen-heavy suites load routes in `beforeAll`.

## v1.0.7 additions

| Piece | Where |
|-------|-------|
| App icon picker: real designs (Classic bowl default, Spoons, Chef's Hat, Cookbook, Pot, Whisk, Fork & Knife) | `assets/app-icons/icons.json` (ids kept from v1.0.6 so an enabled alias survives the update; new `teal`), art generated by `scripts/make-app-icons.py` (foreground, monochrome, legacy, round, preview per icon), `plugins/with-alternate-icons.js` (per-icon monochrome layer), labels on one line in `AppIconPicker` (`src/app/settings.tsx`) |
| Backup as `.zip` + “Save backup as…” | `src/backup/format.ts` (`encodeBackupZip`, `parseBackupFile` — .zip or old .myrecipe, `BACKUP_PICKER_MIME_TYPES`; fflate), `src/backup/device.ts` (`saveBackupAs`), `saveDocumentAsync` in `modules/recipe-share` (SAF ACTION_CREATE_DOCUMENT) |
| Contact Us | `src/app/contact.tsx`, `src/lib/contact.ts` |
| Accent tweaks (deeper Green / Orange / Purple, truer Lime) | `ACCENTS` in `src/lib/theme.ts` |
