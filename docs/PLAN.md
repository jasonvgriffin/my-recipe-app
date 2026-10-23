# My Recipe App — Plan

AI-friendly, diabetic-friendly recipe app. Android first, iOS later from the same Expo codebase.

**Rule #1: RECIPES ARE THE CORE** — everything else is optional and hideable (see top of SPEC.md).

**v1 = [docs/SPEC.md](SPEC.md)** (Jason's feature spec: link import, editing, categories, photos,
source links, notes, search, filters, cooked tracking, meal plan calendar, shopping list, dark theme, share,
unit conversion and servings scaling, grocery run mode, tags, pantry, ratings, foldables.
Removed: nutrition (#17), receipt scanning (v1.0.1), household sharing and the MCP server (v1.0.6),
step timers (#15), cooking mode (#19), cook-with-me (#24), and barcode scanning (#27) in v1.1.0).

**Standing rule (Jason, Oct 3 2026):** This is a recipe app, not a nutrition app. Do not add nutrition features (recipes, pantry, or anywhere) unless Jason explicitly asks; apps like Cronometer and MyFitnessPal cover nutrition. Spec #17 (nutrition) was removed;
the pantry tracks item name, quantity and unit, plus optional category, expiration date and brand (no nutrition).

**Release policy:** v1.0.0 = ALL SPEC items 1–27 complete (#17 removed). The first published APK is v1.0.0. Until then CI only
uploads APK _artifacts_ on each push/PR (to keep builds green); a GitHub Release is created only by pushing a
`v*` tag (or a manual `publish` workflow run) — Eve/Jason decide when.
**v1.0.6 (Jason's requests):** household sharing (#25) was removed — existing household rows were migrated to their
owner's personal scope. **MCP server deliberately cut in 1.0.6 at Jason's request; may be revisited in a future version.**
With both gone the app is local-first (no sign-in, no sync); Backup & restore moves data between phones.
Also in v1.0.6: a recipe can be in several categories, Import PDF (on-device, + menu or share a PDF to the app),
the app icon picker and the recipe-detail Save fix.

**v1.1.0 (Jason approved):** barcode scanning, cooking mode, Cook with Me, and step timers are gone.
Servings scaling is on recipe detail. The Supabase client dependency is gone.
Migration `20261013000000_drop_unused_tables.sql` drops `households`, `household_members`, and `receipt_aliases`.
Contact Us is gone. Version `1.1.0`, `versionCode` 11, same release keystore.

**v1.1.1 (Jason approved):** a link import and a new meal stay drafts until Save. Meal-plan chips are the user's recipe categories. The idle “All changes saved” line, the Today button, “Added by you”, and shopping-list aisle headers are gone. Pantry rows show quantity beside the name. The settings gear stays inside the safe area. Version `1.1.1`, `versionCode` 12, same release keystore.

**v1.1.2 (Jason approved):** Settings can check GitHub for a newer release and, on Android, download that `.apk` and hand it to the system installer. The More Settings card mentions updates. New installs use the Purple accent; a saved accent is kept. Version `1.1.2`, `versionCode` 13, same release keystore.

**v1.1.3 (Jason approved):** On the meal-plan day, Save returns to the calendar. Add a recipe and Add custom entry start collapsed. A custom entry is a title with no recipe id, shows on the day and the calendar, and survives backup and restore. Version `1.1.3`, `versionCode` 14, same release keystore.

**v1.1.4 (Jason approved):** The update APK downloads through Android DownloadManager, so it continues with the screen locked and shows the system notification. The installer still opens from the file-system content URI, immediately if the app is in front and on the next resume otherwise. Release notes render headings and bullets. The Updates line tells you to allow installs from this app. Version `1.1.4`, `versionCode` 15, same release keystore.

**v1.1.5 (Jason approved):** The shopping checklist has no Undo button. A check is cleared by tapping that row again. A link import saves and opens the recipe; a failed link saves nothing. Pasted text still waits for Save. Add recipe is unchanged. Version `1.1.5`, `versionCode` 16, same release keystore.

## Phase 1 — Foundation: local recipe CRUD + APK (done in the initial scaffold)

- [x] Expo SDK 57 + TypeScript + expo-router scaffold
- [x] `Recipe` schema (`src/types/recipe.ts`) with validation (required fields, servings > 0)
- [x] Recipe list with search (title / tag / ingredient), add-recipe form, detail view, delete
- [x] Local persistence (AsyncStorage behind a swappable repository) + 2 seed recipes (removed in v1.0.1: no sample recipes)
- [x] Jest tests for schema + storage; typecheck + lint
- [x] GitHub Actions: APK artifact on every push/PR; GitHub Release only on `v*` tag / manual publish
- [x] Dark theme by default; bottom tabs Recipes · Meal plan · Shopping list
- [x] Single import pipeline `src/import/importRecipe` (zod contract, JSON-LD, text, dedupe) — see IMPORT_API.md
- [x] Data model for items 15–22: structured steps (timers), parsed ingredients (units/scaling/merge),
      ratings, tags, pantry, app settings; schema migration v2→v3 (nutrition removed in v5)
- [x] Data layer for v1: categories, cooked/lastCookedAt, notes, sourceUrl, photoUri, meal plan entries,
      shopping lists, schema migration v1→v2, JSON-LD import parser
- [x] Foldables (#23): `useWindowSizeClass`, `TwoPaneLayout`, nav rail, compact/expanded tests
- [x] Cook-with-me module + deep links + persistence (#24) — **removed in v1.1.0**
- [x] Household-ready data (`SyncMeta` in `src/types/record.ts`, UUIDs, tombstones). The LWW sync engine and
      Supabase client were removed (v1.0.6 client, v1.1.0 leftover dependency). Migrations stay in git (#25, docs/SYNC.md)
- [x] Barcode lookup module (Open Food Facts + cache) (#27) — **removed in v1.1.0**
- [x] Settings → Optional features toggles; recipes-first acceptance test
- [x] Paywall-ready gating: `src/entitlements` (registry, config all free, `LocalFreeEntitlements`), `useFeature`,
      `<FeatureGate>`, `canUse` in import and pantry; tests

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
8. ~~Step timers (#15)~~ — removed in v1.1.0
9. Unit toggle per recipe + app setting; servings scaler on recipe detail (#16, scaler shipped in v1.1.0)
10. ~~Nutrition (#17)~~ — removed by Jason (Oct 3 2026): recipe app, not a nutrition app
11. Grocery run mode for a recipe or the planned week (big checklist, pantry-aware) (#18)
12. ~~Cooking mode (#19)~~ — removed in v1.1.0 (grocery run still keeps the screen awake)
13. Tag filter chips + tag management (#20)
14. Pantry tab/screen + "what can I cook" suggestions + shopping skip (#21)
15. Star rating input + sort/filter controls (#22)
16. Household UI: Settings → Household (email code sign-in, create/join with invite code), sync triggers (#25)
17. ~~Barcode scanner + receipt scanning (#26, #27)~~ — receipt scanning removed in v1.0.1; barcode scanning removed in v1.1.0
18. Remaining two-pane screens (meal plan, shopping+pantry) with compact/expanded tests (#23)
19. Polish: app icon + splash, empty states → release keystore → tag **v1.0.0** (first published APK)

- [ ] Optional: move storage to `expo-sqlite` if recipe count / querying needs grow
- [x] Production signing keystore in GitHub secrets (`ANDROID_KEYSTORE_BASE64` and the matching passwords). The same key signs every update. Do not rotate it without Jason's OK.

## Phase 3 — AI-friendly

> **MCP server deliberately cut in 1.0.6 at Jason's request; may be revisited in a future version.** The notes below
> are kept as history (the code is in git history: `src/mcp/`, `supabase/functions/mcp/`, `site/oauth/`).

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
   server-side `ImportDeps`, so validation and URL dedupe are identical to the app.
   - Tools: `add_recipe`, `update_recipe`, `search_recipes`, `get_recipe`, `list_tags`
     (inputs/outputs derived from the shared `Recipe` schema; consider a shared `@my-recipe-app/schema` package or zod).
   - Streamable HTTP transport, **HTTPS only**. Server-side validation matches the app.
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
5. Nice-to-haves: servings scaling shipped on recipe detail in v1.1.0. AI recipe tweak suggestions stay a later idea (no nutrition features).

## Phase 4 — iOS

- Same codebase; bundle id `com.jasonvgriffin.myrecipeapp` already in `app.json`.
- Build via **EAS Build** or a **GitHub macOS runner** (prebuild + xcodebuild/fastlane).
- Requires **Apple Developer Program ($99/yr)** for device installs / TestFlight / App Store.
- QA pass for iOS-specific UI (safe areas, keyboard, share extension).

## Future features (planned)

- [ ] Multi-language support (planned future feature).

## Open decisions for Jason

- **Monetization (later):** which features go premium, and the billing path (Google Play Billing or
  RevenueCat). Code is ready: flip `tier` in `src/entitlements/features.ts` and plug in an `EntitlementProvider`.

1. ~~**Distribution on Android**~~ — **Resolved (v1.1.0):** the repo is public. Install from GitHub Releases
   (each release has one asset, `my-recipe-app-<version>.apk`; the app updates itself from Settings > Updates). Google Play is a later choice, not the v1 path.
2. ~~**Release signing**~~ — **Resolved:** the production keystore is in GitHub Actions secrets. CI signs release
   APKs with it. Do not regenerate or rotate it without Jason's OK.
3. ~~**Backend / hosting** for sync + MCP~~ — **Moot since v1.0.6, confirmed in v1.1.0.** The app is local-only.
   There is no Supabase client. The hosted project remains only so old migrations can be applied; v1.1.0 drops
   the unused `households`, `household_members`, and `receipt_aliases` tables.
4. ~~**MCP auth:** API key only vs OAuth?~~ **Resolved (Oct 3 2026): OAuth** tied to the household-sharing email-code account; own paywall switch; per-user rate limits (see Phase 3). _Moot since v1.0.6: MCP server deliberately cut in 1.0.6 at Jason's request; may be revisited in a future version._
5. **Storage engine:** stay on AsyncStorage for now, or switch to `expo-sqlite` early?
6. ~~Nutrition lookup source~~ — resolved (Oct 3 2026): no nutrition features at all.
7. **iOS timing** and whether to pay for Apple Developer ($99/yr) and/or EAS.
8. ~~**Multi-user**~~ — **Moot.** Household sharing was removed in v1.0.6. v1.1.0 drops the unused household tables. The app is a single-phone recipe box; Backup & restore moves a copy to another phone.
9. ~~Low-carb threshold~~ — resolved (Oct 3 2026): label removed with nutrition.
10. **"Cooked recently" window:** fixed at 14 days since v1.0.2 (`COOKED_RECENTLY_DAYS` in `src/lib/recipe-utils.ts`; the setting was removed).
11. **Photos:** keep on-device only (lost if the app is uninstalled) until a sync backend exists — OK?
12. ~~**Timer notifications**~~ — **Moot in v1.1.0.** Step timers were removed. `POST_NOTIFICATIONS` and exact-alarm permissions stay blocked.
