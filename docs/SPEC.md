# My Recipe App — v1 Feature Spec

Source: Jason Griffin, 2026-10-02 (items 15–22 added the same evening). **v1 = this spec.**

> **Release rule: v1.0.0 = ALL features 1–22 complete.** The first published APK is **v1.0.0**.
> No incremental/rolling APK releases before that — CI builds an APK artifact on every push/PR only to
> prove the build stays green. Releases are published only from a `v*` tag (or a manual `publish` run).

 The remote MCP server / sync backend stays a later phase
(see [PLAN.md](PLAN.md)). Standing product rules: diabetic-friendly, low-carb, **allulose is the only
sugar-free sweetener — never monk fruit**.

Status legend: ✅ done · 🟡 data layer / partial UI ready · ⬜ not started.
"Where" points at the code a feature PR should extend.

| # | Feature (as specified by Jason) | Status | Where |
|---|---|---|---|
| 1 | **Link import:** paste a recipe web page URL and the app imports the recipe. Parse schema.org `Recipe` JSON-LD first, fall back to heuristics. | 🟡 `importRecipe({kind:'url'})` fetch + JSON-LD + dedupe done & tested; heuristics stub; no UI yet | `src/import/` ([IMPORT_API.md](IMPORT_API.md)) |
| 2 | **In-app editing of everything**, including substitute / add / delete ingredients. | ⬜ (add form exists; `Ingredient.substitutionNote` in schema) | `src/app/add.tsx`, new `src/app/recipe/[id]/edit.tsx` |
| 3 | **Custom categories:** user creates any number with any name (Breakfast, Breads, …) and assigns recipes to them. | 🟡 `Category` type + store CRUD + `categoryIds` + filter helper | `src/storage/recipes.ts` |
| 4 | **Optional photo per recipe** (camera or gallery). | 🟡 `photoUri` field | needs `expo-image-picker` |
| 5 | **Keep the original source link** with imported recipes, tappable to open. | ✅ `sourceUrl` field, tappable on detail | `src/app/recipe/[id].tsx` |
| 6 | **Free-text notes** per recipe. | 🟡 `notes` field, shown on detail, searched; not yet editable | |
| 7 | **Custom recipe titles.** | ✅ title set on add (editing via #2) | |
| 8 | **Keyword search** across all recipes. | ✅ title/tags/ingredients/steps/notes | `searchRecipes` |
| 9 | **Filters:** cooked, cooked recently, keyword. | ✅ chips on Recipes tab (recent = 14 days) | `filterRecipes` |
| 10 | **Cooked toggle** per recipe (track last cooked date). | ✅ toggle on detail; `cooked` + `lastCookedAt` | `setCooked` |
| 11 | **Meal planning tab**, separate from recipes, with a **calendar view**; add/link recipes to days. | 🟡 tab with week view; "Plan for today" on detail; no month calendar / day picker yet | `src/app/(tabs)/meal-plan.tsx`, `src/storage/meal-plan.ts` |
| 12 | **Shopping list** auto-compiled from a planned week's recipes, with check-off items. | 🟡 builds from current week, dedupes lines, check-off persists; no quantity merge / week picker | `src/app/(tabs)/shopping.tsx`, `src/lib/shopping.ts` |
| 13 | **Dark theme** throughout. | ✅ dark by default (`userInterfaceStyle: "dark"`) | `src/lib/theme.ts` |
| 14 | **Share button** via the Android share sheet, letting the user choose what to share: recipe text, photo, source link, or any combination. | ⬜ | detail screen; `expo-sharing` / RN `Share` |
| 15 | **Built-in step timers:** timers tied to individual recipe steps — detect times in step text, tap to start, run in the background with a notification. | 🟡 `Step.durationSeconds`, `detectStepDuration` (ranges use upper bound), ⏱ shown on detail; no running timer / notification yet | `src/lib/timers.ts`; needs `expo-notifications` |
| 16 | **Unit conversion** metric ↔ imperial: per-recipe toggle + app setting. | 🟡 parsed ingredients `{quantity, unit, name, note}`, `convertIngredient`, `Recipe.unitSystem`, `AppSettings.unitSystem`; no UI toggle yet | `src/lib/units.ts`, `src/lib/ingredients.ts`, `src/storage/settings.ts` |
| 17 | **Nutritional info per serving:** calories, carbs, net carbs, protein, fat, fiber. Manual entry first; imported from schema.org `nutrition` when present; computed lookup later. | 🟡 `Recipe.nutrition`, `netCarbs()`, JSON-LD nutrition import; add form only takes net carbs | `src/types/recipe.ts`, `src/import/parsers/json-ld.ts` |
| 18 | **Grocery run mode:** strip a recipe or the planned meals down to just the items to buy, as a big checkable list. | 🟡 `compileItems` (merge, scale, pantry skip) works for one recipe or a week; no full-screen mode UI | `src/lib/shopping.ts` |
| 19 | **Cooking mode:** full-screen, one step at a time, keep screen awake, large text, step timers inline. | ⬜ (`AppSettings.cookingModeKeepAwake`, step durations ready) | new `src/app/recipe/[id]/cook.tsx`; needs `expo-keep-awake` |
| 20 | **Tags:** free-form, multiple per recipe, filterable; distinct from categories. | 🟡 `Recipe.tags`, entered on add form, `filterRecipes({ tags })`; no tag filter UI yet | `src/lib/recipe-utils.ts` |
| 21 | **Pantry tracker:** list what's on hand with optional quantities; suggest recipes ranked by how many ingredients you already have; shopping list skips items in the pantry. | 🟡 `PantryItem`, pantry store, `rankRecipesByPantry`, shopping `pantry` skip; no UI | `src/storage/pantry.ts`, `src/lib/pantry.ts` |
| 22 | **Five-star ratings** per recipe, sortable and filterable. | 🟡 `Recipe.rating`, `setRating`, `sortRecipes('rating')`, `filterRecipes({ minRating })`; stars shown in list; no rating input yet | `src/lib/recipe-utils.ts` |
