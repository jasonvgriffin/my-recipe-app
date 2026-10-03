# AGENTS.md — My Recipe App

Guidance for Cursor cloud agents (and any other coding agent) working in this repo.

## Rule #1: RECIPES ARE THE CORE

Pantry, meal planning, shopping list, grocery run, receipt/barcode scanning and household sharing are optional
nice-to-haves. The app opens to Recipes; no onboarding, sign-in or setup; no recipe flow requires or prompts
optional features; cross-links are unobtrusive and absent when a feature is hidden (`useSettings().features`)
or empty; empty optional features never nag; Settings → Optional features hides the optional tabs. Recipe
features get priority in verification. `__tests__/recipes-first.test.tsx` (full recipe workflow with all
optional features hidden) must stay green. Full text: top of `docs/SPEC.md`.

## Rule #2: PAYWALL-READY FEATURE GATING

Every optional feature is registered in `src/entitlements/` (`FeatureId`, config `{ tier, enabled }` — all
free in v1, `EntitlementProvider` — v1 `LocalFreeEntitlements`). Route every entry point (tab, button, deep
link, sync, module call) through the gate: `useFeature` / `useFeatureVisible` / `<FeatureGate>` in UI,
`canUse(id)` in UI-free modules. The gate is separate from Settings show/hide toggles. Never gate core recipe
CRUD/view/search. No billing SDK, no payment UI. Keep `__tests__/entitlements.test.tsx` green and add a case
for each new gated feature. Full text: top of `docs/SPEC.md`.

## What this is

**My Recipe App** — an AI-friendly, diabetic-friendly recipe app for Jason Griffin.
Android first; iOS later from the **same codebase**.

- **[`docs/SPEC.md`](docs/SPEC.md) is the v1 feature spec** (27 items from Jason, with status and where the code lives).
  Pick spec items from there; one item (or slice) per PR, and update its status row in the same PR.
- [`docs/DESIGN.md`](docs/DESIGN.md) — design rules every PR follows (recipes-first, dark theme, foldables,
  UI-free modules, voice/deep links, household-ready data).
- [`docs/IMPORT_API.md`](docs/IMPORT_API.md) is the recipe import contract (see "Import pipeline" below).
- [`docs/COOK_API.md`](docs/COOK_API.md) — cook-with-me session contract; [`docs/SYNC.md`](docs/SYNC.md) —
  household sync on Supabase.
- [`docs/PLAN.md`](docs/PLAN.md) is the phased roadmap (the remote MCP server is a later phase).

## Stack

- React Native + **Expo SDK 57** (TypeScript, strict), React 19, React Native 0.86
- **expo-router** (file-based routes in `src/app/`)
- Local storage: `@react-native-async-storage/async-storage`, wrapped by a swappable `KeyValueStore`
  repository in `src/storage/recipes.ts`
- Tests: Jest with the `jest-expo` preset (`__tests__/`)
- Lint: ESLint 9 via `eslint-config-expo` (`npx expo lint`)
- Android package / iOS bundle id: `com.jasonvgriffin.myrecipeapp`

### Layout

```
src/app/_layout.tsx           root Stack + dark navigation theme
src/app/(tabs)/               bottom tabs: index.tsx (Recipes), meal-plan.tsx, shopping.tsx
src/app/add.tsx               add-recipe form (modal)
src/app/recipe/[id].tsx       recipe detail (cooked toggle, plan for today, source link, delete)
src/types/recipe.ts           Recipe (structured steps, parsed ingredients, nutrition, rating, unitSystem),
                              Category, PantryItem, AppSettings, validation, migrations (single source of truth)
src/types/meal-plan.ts        MealPlanEntry, ShoppingList types
src/import/                   THE import pipeline: importRecipe(), zod contract, parsers (JSON-LD, text,
                              heuristics stub), deep-link/share adapters — no UI deps (docs/IMPORT_API.md)
src/lib/                      pure helpers: recipe-utils (create/search/filter/sort/cooked/rating),
                              ingredients (parse/scale/convert/format), units, timers (detect step times),
                              shopping (merge/scale/pantry-skip; grocery run), pantry (rank by on-hand),
                              dates, theme (dark colors)
src/storage/                  repositories over a KeyValueStore (AsyncStorage by default; inject one in tests):
                              kv.ts (createCollection), recipes.ts (recipes + categories), meal-plan.ts,
                              pantry.ts, settings.ts
src/data/seed.ts    sample recipes inserted on first launch
__tests__/          jest tests
.github/workflows/android.yml   CI: APK artifact every push/PR; Release only on v* tag
.github/workflows/supabase-migrations.yml  applies supabase/migrations on main (see docs/SYNC.md)
```

## Commands

```bash
npm ci                    # install (Node ^20.19.4 || ^22.13 || >=24.3; .nvmrc = 22)
npx expo start            # dev server (Expo Go / dev build / web)
npm test                  # jest
npm run lint              # expo lint
npm run typecheck         # tsc --noEmit
npx expo install <pkg>    # ALWAYS use this to add deps (picks SDK-compatible versions)
npx expo-doctor           # dependency/config sanity check
```

Run **typecheck, lint and tests** before declaring any task done. They also run in CI.

Expo changes a lot between SDKs — do not trust memory. Check the versioned docs for the SDK in
`package.json` (`https://docs.expo.dev/versions/v57.0.0/`) and https://docs.expo.dev/llms.txt.

## Supabase (household sync backend)

Project is live; URL/anon key reach CI builds via repo variable `EXPO_PUBLIC_SUPABASE_URL` + secret
`EXPO_PUBLIC_SUPABASE_ANON_KEY` (not committed). Schema changes = new file in `supabase/migrations/`, smoke-tested
locally, merged to `main` → the migrations workflow applies it. Never commit the DB password or service_role key;
never edit an applied migration. Details: `docs/SYNC.md`.

## How CI builds the APK (and when releases happen)

`.github/workflows/android.yml` runs on push to `main`, PRs to `main`, `v*` tags, and `workflow_dispatch`:

1. JDK 17 + Node 22, `npm ci`, typecheck/lint/test
2. `npx expo prebuild --platform android --clean` (with `CI=1`; the old `--non-interactive` flag is deprecated).
   The generated `android/` (and `ios/`) folders are **gitignored** — never commit or hand-edit them;
   configure native behavior through `app.json` / config plugins (Continuous Native Generation).
3. `./gradlew assembleRelease` (ABIs `arm64-v8a,x86_64`), currently signed with the Expo template's **debug
   keystore** — fine for sideloading, not for the Play Store.
4. Uploads the APK as CI artifact `my-recipe-app-apk` (14-day retention) on **every** run — this is how we prove
   the build stays green. Download it from the run page while signed in to GitHub (private repo).
5. **Releases:** a GitHub Release with the APK is published **only** for a pushed tag `v*` (e.g. `v1.0.0`) or a
   manual run with `publish: true` + `tag`. The tag must match `app.json` `expo.version`; existing releases are
   never overwritten. **No rolling/incremental releases.** **v1.0.0 = all SPEC items 1–27 complete, and is the
   first published APK.** Agents must not push `v*` tags or trigger a publish run — Eve/Jason do that.

Android SDK/Gradle builds happen **only in CI**; cloud agents don't need the Android SDK.

## Branch / PR rules

- `main` must stay green (CI builds the APK on every push/PR). Releases only from `v*` tags (see above).
- Work on a feature branch; open **small, focused PRs** (one concern each) with a clear description and test notes.
- CI must be green before merge. **Eve merges** PRs (agents do not self-merge to `main` unless Eve says so).
- Don't force-push `main`. Don't commit secrets, keystores, `.env` files, or generated `android/`/`ios/` folders.

## Product rules (Jason's preferences)

- **Dark theme throughout** (spec #13). Use `colors` from `src/lib/theme.ts`; never hard-code light colors.

- Recipes are **diabetic-friendly and low-carb**. Always track `servings` and `carbsPerServing` (net grams).
- **Allulose is the only sugar-free sweetener. Never use or suggest monk fruit** (or luo han guo / mogrosides)
  — not in seed data, examples, tests, AI prompts, or suggestions. `validateRecipeInput` enforces this; keep it.
- Net carbs live in `recipe.nutrition.netCarbsG` (use `netCarbs()`); all nutrition is per serving.
- Never default unknown carbs/nutrition to 0 (`carbsPerServing` is optional = unknown); that would mislead a diabetic user.
- Keep the `Recipe` schema in `src/types/recipe.ts` JSON-serializable and versioned (`schemaVersion`);
  bump `RECIPE_SCHEMA_VERSION` and extend `migrateRecipe` when changing the stored shape.
- Put logic in pure, unit-tested helpers (`src/lib`, `src/storage`); keep screens thin.

## Import pipeline (design constraint)

Eventually an MCP server will let Jason's AI assistant send recipes in by voice ("Hey AI, send this recipe
to my recipe app"). So:

- **Every** way a recipe enters the app — link-import UI, pasted text, Android share intent, deep link
  `myrecipeapp://import?url=…`, and later MCP / sync / file import — calls `importRecipe(input)` from `@/import`.
  Never write imported recipes to storage directly and never add a parallel import path.
- `src/import/` must stay free of React / react-native imports (it will be reused by a Node MCP server).
  Inject storage/network/clock through `ImportDeps`.
- Changing the contract (`src/import/types.ts`) requires updating `docs/IMPORT_API.md` and `__tests__/import.test.ts`.
- Don't rely on the global `URL` class in shared code (RN's is a partial polyfill); use `src/import/url.ts`.
- MCP server work itself is a later phase — don't start it without Jason's OK.

## Signing & secrets

- The **release signing keystore must live in GitHub Actions secrets** (e.g. `ANDROID_KEYSTORE_BASE64`,
  `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`) and be decoded at build time.
  **Never commit** keystores (`*.jks`, `*.keystore`), `.p8/.p12`, provisioning profiles, or API keys.
- Do not sign up for outside services (Expo/EAS, Apple, Google Play, hosting) or spend money without Jason's OK.

## Future iOS path (needs Jason's OK — costs money)

Same codebase; `ios.bundleIdentifier` is already set. Options:

1. **EAS Build** (Expo account; free tier has limited queue, paid plans faster), or
2. **GitHub Actions macOS runner** with `npx expo prebuild --platform ios` + `xcodebuild`/fastlane.

Either way installing on a real iPhone / TestFlight requires an **Apple Developer Program account ($99/yr)**.
Do not create accounts or purchase anything — ask Jason first.
