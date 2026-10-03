# My Recipe App — Plan

AI-friendly, diabetic-friendly recipe app. Android first, iOS later from the same Expo codebase.

**v1 = [docs/SPEC.md](SPEC.md)** (Jason's 14-item feature spec: link import, editing, categories, photos,
source links, notes, search, filters, cooked tracking, meal plan calendar, shopping list, dark theme, share).
The remote MCP server and sync backend are **not** part of v1; they remain Phase 3.

## Phase 1 — Foundation: local recipe CRUD + APK (done in the initial scaffold)

- [x] Expo SDK 57 + TypeScript + expo-router scaffold
- [x] `Recipe` schema (`src/types/recipe.ts`) with validation (required fields, servings > 0, carbs ≥ 0,
      **no monk fruit** — allulose only)
- [x] Recipe list with search (title / tag / ingredient), add-recipe form, detail view, delete
- [x] Local persistence (AsyncStorage behind a swappable repository) + 2 seed recipes
- [x] Jest tests for schema + storage; typecheck + lint
- [x] GitHub Actions: APK artifact + rolling `latest-apk` prerelease
- [x] Dark theme by default; bottom tabs Recipes · Meal plan · Shopping list
- [x] Single import pipeline `src/import/importRecipe` (zod contract, JSON-LD, text, dedupe) — see IMPORT_API.md
- [x] Data layer for v1: categories, cooked/lastCookedAt, notes, sourceUrl, photoUri, meal plan entries,
      shopping lists, schema migration v1→v2, JSON-LD import parser

## Phase 2 — v1 features per SPEC.md (cloud-agent PRs)

Suggested PR order (each small, with tests; update the status table in SPEC.md):
1. Edit recipe screen incl. substitute/add/delete ingredients, notes, title (#2, #6, #7)
2. Categories UI: manage list, assign on edit, category filter chips (#3)
3. Link import UI calling `importRecipe({ kind: 'url' })` + heuristics parser; deep link route + Android share
   intent, all via the same function ([IMPORT_API.md](IMPORT_API.md)) (#1, #5)
4. Photo per recipe via `expo-image-picker` (camera/gallery), stored in app documents dir (#4)
5. Meal plan calendar (month view + day picker, add/remove/move entries) (#11)
6. Shopping list: week picker, quantity merge, manual items, clear checked (#12)
7. Share sheet with selectable parts: text / photo / link (#14)
8. Polish: app icon + splash, sort options, empty states
- [ ] Optional: move storage to `expo-sqlite` if recipe count / querying needs grow
- [ ] Production signing keystore in GitHub secrets (needed before Play Store)

## Phase 3 — AI-friendly (after v1)

Goal: Jason can ask Grok (or another assistant) to add, tweak, and find recipes, and see them in the app.

1. **Export / import**
   - Export one or all recipes as **JSON** (schema-versioned, round-trippable) and **Markdown**
     (human/LLM-readable: title, servings, carbs, ingredients, steps, tags).
   - Import JSON (and later Markdown/plain text) via `importRecipe({ kind: 'structured' | 'text' })`.
2. **Share sheet**
   - Share a recipe out as Markdown/text (expo-sharing / RN `Share`).
   - Receive shared text/URLs into the app as a draft recipe (Android intent filter via config plugin).
3. **Remote MCP server** (separate repo or `server/` package; TypeScript) — "Hey AI, send this recipe to my
   recipe app". Its write tools call the same `importRecipe` (`kind: 'structured'`) from `src/import/` with
   server-side `ImportDeps`, so validation, the allulose-only rule and URL dedupe are identical to the app.
   - Tools: `add_recipe`, `update_recipe`, `search_recipes`, `get_recipe`, `list_tags`
     (inputs/outputs derived from the shared `Recipe` schema; consider a shared `@my-recipe-app/schema` package or zod).
   - Streamable HTTP transport, **HTTPS only**, auth via **API key** (simple) or **OAuth** (for Grok/ChatGPT/Claude
     connectors that require it). Server-side validation enforces the allulose-only rule.
   - Hosting options: Cloudflare Workers + D1, Fly.io/Render + Postgres, Supabase (Postgres + Edge Functions).
4. **Sync backend**
   - The app keeps working offline (local store is the source of truth on device).
   - Sync with the same backend the MCP server uses: last-write-wins on `updatedAt` to start, soft deletes
     (tombstones), per-user API token stored in `expo-secure-store`.
   - Swap in a `SyncedRecipeStore` implementing the existing repository interface.
5. Nice-to-haves: carb calculator from ingredients, scale servings, AI "make this low-carb" suggestions
   (must respect the allulose-only rule).

## Phase 4 — iOS

- Same codebase; bundle id `com.jasonvgriffin.myrecipeapp` already in `app.json`.
- Build via **EAS Build** or a **GitHub macOS runner** (prebuild + xcodebuild/fastlane).
- Requires **Apple Developer Program ($99/yr)** for device installs / TestFlight / App Store.
- QA pass for iOS-specific UI (safe areas, keyboard, share extension).

## Open decisions for Jason

1. **Distribution on Android:** keep sideloading the `latest-apk` build (private repo → must be signed in to
   GitHub to download), or publish via Google Play (one-time $25 developer fee, needs a real release keystore)?
   A public download location is another option.
2. **Release signing:** OK to generate a production keystore and store it only in GitHub secrets?
3. **Backend / hosting** for sync + MCP: Cloudflare, Supabase, Fly.io, or something else? Any budget?
4. **MCP auth:** API key only (simplest, personal use) vs OAuth (needed by some assistant connectors)?
5. **Storage engine:** stay on AsyncStorage for now, or switch to `expo-sqlite` early?
6. **Nutrition data:** manual net-carb entry only, or integrate a nutrition source (e.g. Cronometer export,
   USDA FoodData Central) later?
7. **iOS timing** and whether to pay for Apple Developer ($99/yr) and/or EAS.
8. **Multi-user:** just Jason, or family members sharing a recipe box?
9. **Low-carb threshold:** currently ≤ 15 g net carbs/serving gets the "low-carb" label — adjust?
10. **"Cooked recently" window:** currently 14 days — adjust?
11. **Photos:** keep on-device only (lost if the app is uninstalled) until a sync backend exists — OK?
