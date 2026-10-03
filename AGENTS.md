# AGENTS.md — My Recipe App

Guidance for Cursor cloud agents (and any other coding agent) working in this repo.

## What this is

**My Recipe App** — an AI-friendly, diabetic-friendly recipe app for Jason Griffin.
Android first; iOS later from the **same codebase**. See [`docs/PLAN.md`](docs/PLAN.md) for the roadmap.

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
src/app/            routes: index.tsx (list), add.tsx (form), recipe/[id].tsx (detail), _layout.tsx (Stack)
src/types/recipe.ts Recipe schema + validation (single source of truth; also used by future export + MCP server)
src/lib/            pure helpers (parsing, createRecipe, search, theme)
src/storage/        recipe repository (AsyncStorage by default; inject a store for tests)
src/data/seed.ts    sample recipes inserted on first launch
__tests__/          jest tests
.github/workflows/android.yml   CI APK build + `latest-apk` prerelease
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

## How CI builds the APK

`.github/workflows/android.yml` runs on push to `main`, PRs to `main`, and `workflow_dispatch`:

1. JDK 17 + Node 22, `npm ci`, typecheck/lint/test
2. `npx expo prebuild --platform android --clean` (with `CI=1`; the old `--non-interactive` flag is deprecated).
   The generated `android/` (and `ios/`) folders are **gitignored** — never commit or hand-edit them;
   configure native behavior through `app.json` / config plugins (Continuous Native Generation).
3. `./gradlew assembleRelease` (ABIs `arm64-v8a,x86_64`), signed with the Expo template's **debug keystore**
   — fine for sideloading, **not** for the Play Store.
4. Uploads the APK as artifact `my-recipe-app-apk`, and (on `main` only) deletes + recreates the rolling
   prerelease **`latest-apk`** with asset `my-recipe-app.apk`. Stable URL:
   `https://github.com/jasonvgriffin/my-recipe-app/releases/download/latest-apk/my-recipe-app.apk`
   The repo is **private**, so downloading requires being signed in to GitHub as someone with access.

Android SDK/Gradle builds happen **only in CI**; cloud agents don't need the Android SDK.

## Branch / PR rules

- `main` is always releasable; every push to `main` ships a new `latest-apk`.
- Work on a feature branch; open **small, focused PRs** (one concern each) with a clear description and test notes.
- CI must be green before merge. **Eve merges** PRs (agents do not self-merge to `main` unless Eve says so).
- Don't force-push `main`. Don't commit secrets, keystores, `.env` files, or generated `android/`/`ios/` folders.

## Product rules (Jason's preferences)

- Recipes are **diabetic-friendly and low-carb**. Always track `servings` and `carbsPerServing` (net grams).
- **Allulose is the only sugar-free sweetener. Never use or suggest monk fruit** (or luo han guo / mogrosides)
  — not in seed data, examples, tests, AI prompts, or suggestions. `validateRecipeInput` enforces this; keep it.
- Keep the `Recipe` schema in `src/types/recipe.ts` JSON-serializable and versioned (`schemaVersion`);
  add a migration when changing the stored shape.

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
