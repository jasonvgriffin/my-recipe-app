# My Recipe App — v1 Feature Spec

Source: Jason Griffin, 2026-10-02. **v1 = this spec.** The remote MCP server / sync backend stays a later phase
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

## Design constraint: one import pipeline (voice / AI-assistant ready)

Eventually an MCP server will let Jason's AI assistant send recipes into the app by voice
(*"Hey AI, send this recipe to my recipe app"*). No MCP work in v1, but:

- **All imports go through `importRecipe(input)` in `src/import/`** — in-app link import, pasted text,
  Android share intent, deep links (`myrecipeapp://import?url=…`), and later MCP and sync.
- Input is a discriminated union: `{ kind: 'url', url }` | `{ kind: 'structured', recipe: RecipeDraft, source? }`
  | `{ kind: 'text', text }`. The draft is validated with zod, normalized, checked against house rules
  (no monk fruit), and **deduped by normalized source URL**.
- The module is pure TypeScript with **no UI dependencies**; storage/network/clock are injected.
- Contract: [IMPORT_API.md](IMPORT_API.md). Don't add a second import path.

## Notes for implementers

- Navigation: bottom tabs **Recipes · Meal plan · Shopping list** in `src/app/(tabs)/`; recipe detail and add
  are stack screens above the tabs.
- All data types live in `src/types/` (`recipe.ts`, `meal-plan.ts`). Bump `RECIPE_SCHEMA_VERSION` and extend
  `migrateRecipe` whenever the stored shape changes.
- Storage goes through repositories in `src/storage/` (`createRecipeStore`, `createMealPlanStore`) built on
  `createCollection` over a `KeyValueStore`; tests inject an in-memory store.
- Imported recipes enter only via `importRecipe` (validates, rejects monk fruit, keeps `sourceUrl`, dedupes).
- One spec item (or a slice of one) per PR. Keep the dark theme: use `colors` from `src/lib/theme.ts`.
