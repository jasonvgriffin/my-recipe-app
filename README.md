# My Recipe App README

Greetings,

I built this Android recipe app to get hands-on experience building software with AI coding agents. I like to cook, so it seemed like a good place to start. AI agents wrote almost all of the code and most of this README. I wrote the requirements, made the product decisions, tested the builds on my phone, and merged the changes.

My goal was to create a very basic app with some useful features. The rest of this file is written by AI.

Kindly,

Jason Griffin

### Try it

- Android only. Allow installs from unknown sources when your phone asks (Settings > Security, or the prompt that appears when you open the APK).
- Download the latest APK from <https://github.com/jasonvgriffin/my-recipe-app/releases> and open it to install.
- After that, the app can update itself: Settings > Updates downloads the newest release from GitHub.

### How I built it

- I wrote a feature spec ([docs/SPEC.md](docs/SPEC.md)) and decided what to build and what to cut.
- Cursor cloud agents wrote the code in pull requests, several running in parallel.
- GitHub Actions ran typecheck, lint and tests on every PR and built a signed APK.
- I installed the builds on my phone, checked them, and merged the PRs.
- Each problem became a rule in [LESSONS.md](LESSONS.md), which the agents read before every build.

### Tools and limitations

- Tools: Cursor cloud agents; Eve, a personal AI assistant (Grok Bot) I set up to coordinate the coding agents; GitHub Actions; React Native, Expo and TypeScript.
- Limitations: Android only (no iOS build), data stays on the device (no account or sync), and it is built for a single user.

### What I learned

- Check the real screen, not the math. Tab labels that fit by layout math were cut off on my phone, so builds are now checked from real renders at 360dp.
- Open every screenshot before signing off. Screenshots an agent attached as "evidence" turned out to be red error overlays.
- Put review checklists in the build prompt up front, so one agent run is enough and fix-up runs are avoided.
- Batch changes into fewer versions, because every build and review costs usage.

### Features

- Import recipes by copying a URL and entering them into the app.
- Add recipes manually and add tags to them.
- Search for recipes in a search field with optional filters.
- Edit and/or create custom categories.
- Rate the recipes.
- Meal plan.
- Create an inventory of their pantry and a shopping list.
- Scale a recipe's servings up or down.
- Update the app from inside it: it checks GitHub Releases for new versions.
- Export recipes in PDF format.

### Look and device support

- System, Light or Dark theme, with 12 accent colors. Each accent uses one shade in both modes.
- App icon picker (6 launcher icons).
- Foldables and tablets: two panes side by side on wide screens, and a side navigation rail on expanded widths.
- Backup & restore: everything goes into one .zip (recipes, photos, categories, plan, lists, pantry, settings). You can share it or save it anywhere with "Save as". Restoring lets you merge or replace.

Removed along the way (the code is in git history): nutrition (Oct 3), receipt scanning (v1.0.1), sample recipes (v1.0.1), household sharing, cloud sync, sign-in, and the remote MCP server (all v1.0.6), then barcode scanning and cooking mode (v1.1.0).

## Stack

- React Native 0.86 + Expo SDK 57, React 19, TypeScript (strict)
- expo-router (file-based routes in src/app/), React Compiler and typed routes turned on
- Storage: AsyncStorage behind a swappable KeyValueStore repository (src/storage/)
- zod for import and backup validation; fflate for backup zips
- Expo modules: image-picker (recipe photos), print (PDF export), sharing, file-system, keep-awake (keeps the screen on during a grocery run), and others
- A local native module modules/recipe-share (FileProvider sharing, the Save-as dialog, app icon switching)
- Config plugins: plugins/with-release-signing.js, plugins/with-alternate-icons.js
- Tests: Jest + jest-expo + React Native Testing Library (__tests__/). Lint: ESLint 9 (eslint-config-expo)
- Node 22 (.nvmrc)

## Install on Android, build and release

### Installing on a phone

- Allow installs from unknown sources when prompted (Settings > Security, or the prompt that appears when you open the APK).
- Download the latest APK from the Releases page (<https://github.com/jasonvgriffin/my-recipe-app/releases>) and open it on your phone to install. The repo is at https://github.com/jasonvgriffin/my-recipe-app.
- Each release has one asset, my-recipe-app-<version>.apk (for example my-recipe-app-1.1.5.apk).
- Every release is signed with the same release key, so updates install over the previous version. The app has a built-in updater (Settings > Updates) that downloads new releases from GitHub, so you don't need Obtainium or any other update tracker.

### Developing locally

```
npm ci
npx expo start        # Expo Go / emulator / web
npm test
npm run lint
npm run typecheck
```

Add dependencies with npx expo install <pkg> so the versions match the SDK. The android/ and ios/ folders are generated by expo prebuild and gitignored, so native changes go through app.json or config plugins.

### CI workflows (.github/workflows/)

- android.yml (Android APK). Runs on pushes to main, PRs to main, v* tags and manual runs. Steps:
  - Set up JDK 17 and Node 22, run npm ci, then typecheck, lint and tests.
  - Run expo prebuild --platform android --clean.
  - Run ./gradlew assembleRelease for arm64-v8a and x86_64.
  - Re-sign with apksigner so the APK has v1, v2 and v3 signatures. AGP leaves out v1 when minSdk is 24 or higher.
  - Verify the signature, check 16 KB zipalign, fail if any blocked permission is present, and check the launcher icons and aliases.
  - Upload the APK as the my-recipe-app-apk artifact (kept 14 days).

A GitHub Release is published only for a pushed v* tag, or a manual run with publish: true and a tag. The tag must match expo.version, and an existing release is never overwritten.

- pages.yml. Publishes site/ (a one-page placeholder) to GitHub Pages. The MCP OAuth consent page that used to live there was removed in v1.0.6.

### Signing

- The release keystore lives only in GitHub Actions secrets (ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD). CI decodes it into the runner temp folder and deletes it after the build.
- Without those secrets (local builds, fork PRs), the build falls back to the debug key with a warning, and a publish run fails.
- The same key has to sign every update. Never regenerate or rotate it without my OK. A backup is kept outside the repo.

### Versioning

app.json holds expo.version and android.versionCode. The current release is v1.1.5 (versionCode 16). v1.0.0 through v1.0.9 shipped on Oct 3–4, 2026, and v1.1.0 through v1.1.4 on Oct 13–15, 2026.

Shipped in v1.1.5:

- The shopping checklist no longer has an Undo button. I check an item off, and I tap it again to clear it.
- Importing a recipe link saves it and opens the recipe. I don't tap Save for a link. Pasting the recipe text still asks me to save. If the link fails, nothing is stored and I see the error.

Shipped in v1.1.0:

- Removed barcode scanning from the shopping list and pantry.
- Removed cooking mode, Cook with Me, and step timers.
- Added servings scaling.
- Removed leftover Supabase code and unused database tables.
- Removed the sweetener rule.
- Removed the support email from the app.
- Cleaned up the planning docs.

Later ideas: [docs/PLAN.md](docs/PLAN.md) lists these as future ideas without a version: multi-language support, an iOS build (needs Apple Developer, $99/yr), and maybe moving to expo-sqlite.

## Architecture in brief

```
src/app/            expo-router screens (tabs: Recipes, Meal plan, +, Shopping, More)
src/types/          Recipe and other record types, validation, schema migrations (single source of truth)
src/import/         THE import pipeline: importRecipe() — no React deps (docs/IMPORT_API.md)
src/storage/        repositories over a swappable KeyValueStore (AsyncStorage by default)
src/backup/         backup/restore format (docs/BACKUP.md)
src/entitlements/   feature gate (all features free; paywall-ready)
src/pantry/         pantry matching helpers (is an ingredient already on hand)
src/lib/            helpers: recipe utils, ingredients/units, shopping, meal plan, PDF export, app updates, theme
src/components/     shared UI components
src/hooks/          React hooks (settings, theme, feature gates, window size)
src/config/         app configuration
```

- One way in. Every recipe source (link, text, share intent, deep link, PDF) calls importRecipe(). The steps are: parse, validate, normalize, dedupe by source URL, save. Tests cover this for typed text, imports and PDFs.
- Screens stay thin. Logic lives in UI-free modules (ESLint blocks React imports there), so a future server could reuse them.
- Recipes come first, and that's tested. __tests__/recipes-first.test.tsx runs the whole recipe workflow with every optional feature hidden.
- Paywall-ready gating. Each optional feature has a FeatureId, and every entry point checks it. Everything is free, with no billing code. Core recipe features are never gated.
- Design rules are in [docs/DESIGN.md](docs/DESIGN.md): theme tokens only (a test fails on hard-coded colors), text never truncates, keyboard avoidance on every input, and 360dp checks.
- What's left of sync. Stored records still carry sync-era metadata (UUIDs, timestamps, tombstones, and legacy householdId / createdBy fields that backups strip out). The app has no network sync and no Supabase code.

## How this was built with AI agents

AI agents wrote almost all of the code. I decided what the app should do and made the product calls. This section describes how that worked, based on the git history, the PRs and the repo docs.

### Who did what

- Me: I set the requirements: the v1 spec in [docs/SPEC.md](docs/SPEC.md) and the standing product rules (no nutrition, recipes first). I picked the app icon, approved or turned down features, and decided what to cut. All 37 pull requests were merged into main from my GitHub account (jasonvgriffin), including the merge commits that stitched the parallel agent branches together.
- Cursor cloud agents wrote the feature code through pull requests. On Oct 3, six agents worked in parallel, one per group of spec items, on cursor/... branches: PRs #1–#6 ("[v1 group A–F]" covering recipe core, organize, plan & shop, pantry/barcode, cooking, household sharing). Their commits are authored by "Cursor Agent". Later PRs (#26–#29) have Cursor agent PR bodies with a plan, a yes/no done checklist, screenshot evidence and test counts.
- Eve coordinated the agents. She scaffolded the project on Oct 2 (Expo starter, spec, data model, CI), wrote the docs, built several v1.0.6 pieces herself (backup & restore, icon picker, personal sync, then its removal), and keeps [LESSONS.md](LESSONS.md) in sync with her shared "app-build-lessons" skill.
- I also tried a separate design-reviewer bot. It didn't fit the workflow, so its checks moved into the build prompt instead.

### How a build ran (from [AGENTS.md](AGENTS.md))

- Plan: a short plan in the PR description with a yes/no done checklist.
- Work: small, focused PRs, one concern each. CI must be green before merging.
- Self code review of the whole diff (hard-coded colors, keyboard, truncation, tests). For bug fixes, a failing test comes first.
- Compound: record new lessons in [LESSONS.md](LESSONS.md) and list them under "Lessons learned" in the PR so Eve can copy the general ones to my other repos.

Agents may not push v* tags or publish releases. [AGENTS.md](AGENTS.md) reserves that for Eve or me. Since Oct 4 the workflow follows the Compound Engineering plugin (plan → work → code review → compound). The Superpowers plugin was uninstalled that day, but two of its rules stayed: verify before saying something is done, and test-first bug fixes.

### Where the lessons live

- [AGENTS.md](AGENTS.md) holds the rules for any coding agent in this repo: stack, layout, commands, CI, signing, branch/PR rules, product rules, Cursor Cloud setup.
- [LESSONS.md](LESSONS.md) is read before every build. It holds dated lessons from things that actually went wrong. A few examples:
  - v1.0.8: tab labels looked fine by layout math but were cut off on my phone. The rule now is to verify UI from real renders at 360dp.
  - v1.0.8: a hard-coded orange leaked into five places.
  - v1.0.9: a flex: 0 shorthand collapsed the + tab slot on web.
  - v1.0.9: screenshots attached as "evidence" turned out to be red error overlays. Open every screenshot before signing off.
  - Process: batch changes into fewer versions, because every build plus review costs usage. Put reviewer checklists in the build prompt so one agent run is enough.
- PR #28 wrote down the loop for "getting better with Eve". PR #27 set up the Cloud Agent environment (.cursor/setup.sh, .cursor/start.sh).

### Decisions I made

- No nutrition (Oct 3): spec #17 and the low-carb label were removed (PR #8).
- Pantry fields: I cut them down to name and quantity, then brought back the optional category, expiration date and brand (PR #11).
- No receipt scanning and no sample recipes (v1.0.1, PR #12).
- MCP server: approved for v1.0 on Oct 3, with OAuth as the auth choice, and built so Grok could add recipes (PRs #10, #14, #21).
- Cutting sync, household sharing, sign-in and MCP in v1.0.6. On the evening of Oct 3, PR #22 added personal cloud sync so MCP would work without a household, merged at about 8:17 PM CT. About half an hour later (PR #24, merged about 8:54 PM CT; its description says "Jason, 8:41 PM"), household sharing was removed and the MCP server was cut "at Jason's request". That left the app local-only, with Backup & restore (PR #23) as the way to move data. [docs/SYNC.md](docs/SYNC.md) and [docs/PLAN.md](docs/PLAN.md) say MCP "may be revisited in a future version."
- App icon: "bowl with steam (Jason's pick)".

## Docs

- [docs/SPEC.md](docs/SPEC.md): the v1 feature spec and status
- [docs/PLAN.md](docs/PLAN.md): roadmap and open decisions
- [docs/DESIGN.md](docs/DESIGN.md): design rules
- [docs/IMPORT_API.md](docs/IMPORT_API.md), [docs/BACKUP.md](docs/BACKUP.md): module contracts
- [docs/SYNC.md](docs/SYNC.md): why sync was removed
- [docs/INVENTORY.md](docs/INVENTORY.md): what already exists (agents extend it rather than duplicate it)
- [AGENTS.md](AGENTS.md), [LESSONS.md](LESSONS.md): agent rules and lessons

## License

MIT. See [LICENSE](LICENSE). Copyright (c) 2026 Jason Griffin.
