# My Recipe App — Plan

AI-friendly, diabetic-friendly recipe app. Android first, iOS later from the same Expo codebase.

## Phase 1 — Local recipe CRUD + APK (current)

- [x] Expo SDK 57 + TypeScript + expo-router scaffold
- [x] `Recipe` schema (`src/types/recipe.ts`) with validation (required fields, servings > 0, carbs ≥ 0,
      **no monk fruit** — allulose only)
- [x] Recipe list with search (title / tag / ingredient), add-recipe form, detail view, delete
- [x] Local persistence (AsyncStorage behind a swappable repository) + 2 seed recipes
- [x] Jest tests for schema + storage; typecheck + lint
- [x] GitHub Actions: APK artifact + rolling `latest-apk` prerelease
- [ ] Edit recipe screen (reuse the add form)
- [ ] Tag filter chips, sort (newest / A–Z / lowest carbs)
- [ ] Proper app icon + splash for "My Recipe App"
- [ ] Optional: move storage to `expo-sqlite` once recipe count / querying needs grow
- [ ] Production signing keystore in GitHub secrets (needed before Play Store)

## Phase 2 — AI-friendly

Goal: Jason can ask Grok (or another assistant) to add, tweak, and find recipes, and see them in the app.

1. **Export / import**
   - Export one or all recipes as **JSON** (schema-versioned, round-trippable) and **Markdown**
     (human/LLM-readable: title, servings, carbs, ingredients, steps, tags).
   - Import JSON (and later Markdown/plain text) with validation (reuse `validateRecipeInput`, reject monk fruit).
2. **Share sheet**
   - Share a recipe out as Markdown/text (expo-sharing / RN `Share`).
   - Receive shared text/URLs into the app as a draft recipe (Android intent filter via config plugin).
3. **Remote MCP server** (separate repo or `server/` package; TypeScript)
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

## Phase 3 — iOS

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
