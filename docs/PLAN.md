# My Recipe App — Plan

AI-friendly, diabetic-friendly recipe app. Android first, iOS later from the same Expo codebase.

**Rule #1: RECIPES ARE THE CORE** — everything else is optional and hideable (see top of SPEC.md).

**v1 = [docs/SPEC.md](SPEC.md)** (Jason's 27-item feature spec: link import, editing, categories, photos,
source links, notes, search, filters, cooked tracking, meal plan calendar, shopping list, dark theme, share,
step timers, unit conversion, ~~nutrition~~ (removed), grocery run mode, cooking mode, tags, pantry, ratings, foldables,
cook-with-me, household sharing, receipt scanning, barcode scanning).

**Standing rule (Jason, Oct 3 2026):** This is a recipe app, not a nutrition app. Do not add nutrition features (recipes, pantry, or anywhere) unless Jason explicitly asks; apps like Cronometer and MyFitnessPal cover nutrition. Spec #17 (nutrition) was removed;
the pantry tracks item name, quantity and unit, plus optional category, expiration date and brand (no nutrition), and barcode scans use Open Food Facts for the product name and brand only.

**Release policy:** v1.0.0 = ALL SPEC items 1–27 complete (#17 removed). The first published APK is v1.0.0. Until then CI only
uploads APK _artifacts_ on each push/PR (to keep builds green); a GitHub Release is created only by pushing a
`v*` tag (or a manual `publish` workflow run) — Eve/Jason decide when.
Household sync on Supabase (#25) **is** in v1 (project live, migrations applied); the remote MCP server (SPEC #28) is **also in v1.0** (approved by Jason, Oct 3 2026; see docs/MCP.md).

## Phase 1 — Foundation: local recipe CRUD + APK (done in the initial scaffold)

- [x] Expo SDK 57 + TypeScript + expo-router scaffold
- [x] `Recipe` schema (`src/types/recipe.ts`) with validation (required fields, servings > 0,
      **no monk fruit** — allulose only)
- [x] Recipe list with search (title / tag / ingredient), add-recipe form, detail view, delete
- [x] Local persistence (AsyncStorage behind a swappable repository) + 2 seed recipes
- [x] Jest tests for schema + storage; typecheck + lint
- [x] GitHub Actions: APK artifact on every push/PR; GitHub Release only on `v*` tag / manual publish
- [x] Dark theme by default; bottom tabs Recipes · Meal plan · Shopping list
- [x] Single import pipeline `src/import/importRecipe` (zod contract, JSON-LD, text, dedupe) — see IMPORT_API.md
- [x] Data model for items 15–22: structured steps (timers), parsed ingredients (units/scaling/merge),
      ratings, tags, pantry, app settings; schema migration v2→v3 (nutrition removed in v5)
- [x] Data layer for v1: categories, cooked/lastCookedAt, notes, sourceUrl, photoUri, meal plan entries,
      shopping lists, schema migration v1→v2, JSON-LD import parser
- [x] Foldables (#23): `useWindowSizeClass`, `TwoPaneLayout`, nav rail, compact/expanded tests
- [x] Cook-with-me module + deep links + persistence (#24, docs/COOK_API.md)
- [x] Household-ready data (`SyncMeta`, UUIDs, tombstones), repository interface, LWW sync engine, Supabase
      adapter, migrations applied to the live project + CI migration workflow (#25, docs/SYNC.md)
- [x] Barcode lookup module (Open Food Facts + cache + user mapping) (#27)
- [x] Settings → Optional features toggles; recipes-first acceptance test
- [x] Paywall-ready gating: `src/entitlements` (registry, config all free, `LocalFreeEntitlements`), `useFeature`,
      `<FeatureGate>`, `canUse` in import/cooking/sync/pantry; tests

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
8. Step timers: tap ⏱ to start, background + notification (`expo-notifications`) (#15)
9. Unit toggle per recipe + app setting; servings scaler (#16)
10. ~~Nutrition (#17)~~ — removed by Jason (Oct 3 2026): recipe app, not a nutrition app
11. Grocery run mode for a recipe or the planned week (big checklist, pantry-aware) (#18)
12. Cooking mode: full-screen step pager, keep-awake, large text, inline timers (#19)
13. Tag filter chips + tag management (#20)
14. Pantry tab/screen + "what can I cook" suggestions + shopping skip (#21)
15. Star rating input + sort/filter controls (#22)
16. Household UI: Settings → Household (email code sign-in, create/join with invite code), sync triggers (#25)
17. Pantry agent: barcode scanner UI (`expo-camera`) + receipt scanning (#26, #27), on top of #21
18. Remaining two-pane screens (meal plan, shopping+pantry) with compact/expanded tests (#23)
19. Polish: app icon + splash, empty states → release keystore → tag **v1.0.0** (first published APK)

- [ ] Optional: move storage to `expo-sqlite` if recipe count / querying needs grow
- [ ] Production signing keystore in GitHub secrets (needed before v1.0.0 so updates install over each other)

## Phase 3 — AI-friendly (MCP server pulled into v1.0, Oct 3 2026)

Goal: Jason can ask Grok (or another assistant) to add, tweak, and find recipes, and see them in the app.

1. **Export / import**
   - Export one or all recipes as **JSON** (schema-versioned, round-trippable) and **Markdown**
     (human/LLM-readable: title, servings, ingredients, steps, tags).
   - Import JSON (and later Markdown/plain text) via `importRecipe({ kind: 'structured' | 'text' })`.
2. **Share sheet**
   - Share a recipe out as Markdown/text (expo-sharing / RN `Share`).
   - Receive shared text/URLs into the app as a draft recipe (Android intent filter via config plugin).
3. **Remote MCP server** — ✅ built in v1.0: `src/mcp/` + `supabase/functions/mcp/` (docs/MCP.md) — "Hey AI, send this recipe to my
   recipe app". Its write tools call the same `importRecipe` (`kind: 'structured'`) from `src/import/` with
   server-side `ImportDeps`, so validation, the allulose-only rule and URL dedupe are identical to the app.
   - Tools: `add_recipe`, `update_recipe`, `search_recipes`, `get_recipe`, `list_tags`
     (inputs/outputs derived from the shared `Recipe` schema; consider a shared `@my-recipe-app/schema` package or zod).
   - Streamable HTTP transport, **HTTPS only**. Server-side validation enforces the allulose-only rule.
   - **Auth (decided by Jason, Oct 3 2026): OAuth**, tied to the same Supabase email-code (OTP / magic link)
     account that household sharing (#25) uses. Grok, ChatGPT and Claude connectors expect OAuth. An API key
     remains noted as the simpler alternative, but OAuth is the chosen path.
   - **Account + sync required for MCP:** an AI can't reach recipes that live only on the phone, so MCP users
     need the same email-code account with their recipes synced to Supabase. Solo/offline app use still needs
     no account (recipes-first rule unchanged).
   - **Paywall-ready:** MCP gets its own `FeatureId` switch (e.g. `mcpAccess`) in the existing gating layer
     (`src/entitlements`), checked server-side per request, so it can be made premium later.
   - **Per-user rate limits** on the MCP server (per account/token, with sensible burst + daily caps and
     429 responses) so nobody can hammer it for free.
   - Jason approved the MCP server for v1.0 on Oct 3 2026. Hosting: Supabase Edge Functions (free).
   - Hosting options: Cloudflare Workers + D1, Fly.io/Render + Postgres, Supabase (Postgres + Edge Functions).
4. **Sync backend**
   - The app keeps working offline (local store is the source of truth on device).
   - Sync with the same backend the MCP server uses: last-write-wins on `updatedAt` to start, soft deletes
     (tombstones), per-user API token stored in `expo-secure-store`.
   - Swap in a `SyncedRecipeStore` implementing the existing repository interface.
5. Nice-to-haves: scale servings, AI recipe tweak suggestions (must respect the allulose-only rule; no nutrition features).

## Phase 4 — iOS

- Same codebase; bundle id `com.jasonvgriffin.myrecipeapp` already in `app.json`.
- Build via **EAS Build** or a **GitHub macOS runner** (prebuild + xcodebuild/fastlane).
- Requires **Apple Developer Program ($99/yr)** for device installs / TestFlight / App Store.
- QA pass for iOS-specific UI (safe areas, keyboard, share extension).

## Open decisions for Jason

- **Monetization (later):** which features go premium, and the billing path (Google Play Billing via
  RevenueCat, or Supabase-backed entitlements). Code is ready: flip `tier` in
  `src/entitlements/features.ts` and plug in an `EntitlementProvider`.

1. **Distribution on Android:** sideload the v1.0.0 GitHub Release APK (private repo → must be signed in to
   GitHub to download), or publish via Google Play (one-time $25 developer fee, needs a real release keystore)?
2. **Release signing:** OK to generate a production keystore and store it only in GitHub secrets?
3. **Backend / hosting** for sync + MCP: Cloudflare, Supabase, Fly.io, or something else? Any budget?
4. ~~**MCP auth:** API key only vs OAuth?~~ **Resolved (Oct 3 2026): OAuth** tied to the household-sharing email-code account; own paywall switch; per-user rate limits (see Phase 3).
5. **Storage engine:** stay on AsyncStorage for now, or switch to `expo-sqlite` early?
6. ~~Nutrition lookup source~~ — resolved (Oct 3 2026): no nutrition features at all.
7. **iOS timing** and whether to pay for Apple Developer ($99/yr) and/or EAS.
8. **Multi-user:** just Jason, or family members sharing a recipe box?
9. ~~Low-carb threshold~~ — resolved (Oct 3 2026): label removed with nutrition.
10. **"Cooked recently" window:** currently 14 days (`AppSettings.cookedRecentlyDays`) — adjust?
11. **Photos:** keep on-device only (lost if the app is uninstalled) until a sync backend exists — OK?
12. **Timer notifications:** OK to request Android notification permission on first timer start?
