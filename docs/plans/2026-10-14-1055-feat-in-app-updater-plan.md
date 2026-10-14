---
title: In-app updater and v1.1.2 - Plan
type: feat
date: 2026-10-14
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
depth: standard
---

# In-app updater and v1.1.2 - Plan

## Goal Capsule

**Objective:** Jason can see when a newer signed build of My Recipe App is on GitHub and install it from Settings, new installs open in Purple, and More names updates next to backups.

**Means:** Compare the installed version with the public latest GitHub release in a UI-free helper, then on Android download that release's `.apk` and hand a content URI to the system package installer (KTD1, KTD2). Change only the default accent id (KTD3).

**Authority:** Product behavior lives on the R-IDs. Mechanism lives on the KTDs.

**Stop:** Do not auto-check. Do not install on web. Do not change a saved accent. Do not edit `README.md`. Do not add a second FileProvider.

**Execution profile:** One feature branch. Tests for the checker, the Settings states, the default accent, and the More subtitle. Renders at 360dp of each updater state, More, and the purple default.

**Finishes and ships:** Open the pull request. After CI is green, squash-merge and publish v1.1.2 the way v1.1.1 was published (tag push; the workflow signs with the existing release keystore and attaches `my-recipe-app-1.1.2.apk`).

## Product Contract

### Summary

v1.1.2 adds a manual Settings updater for `jasonvgriffin/my-recipe-app` GitHub releases, renames the More Settings card subtitle, and makes Purple the accent for a new install.

### Problem Frame

The app only updates when someone downloads an APK by hand. Settings does not say that an update exists. New installs still start on Green. The More card does not mention updates.

### Requirements

- R1. Settings has a "Check for updates" button. It does not run until that button is pressed. Nothing checks in the background.
- R2. The check reads `https://api.github.com/repos/jasonvgriffin/my-recipe-app/releases/latest` and compares that version with the installed `expo.version`.
- R3. A newer release shows its version, its release notes, and an "Update" button.
- R4. Update downloads that release's `.apk`, shows progress, and hands the file to Android's package installer as a content URI from the existing file-system FileProvider.
- R5. The manifest requests `REQUEST_INSTALL_PACKAGES`. If Android has not allowed installs from this app, the screen explains that and opens the system "install unknown apps" setting.
- R6. When the installed version is the same or newer, the screen says "You're on the latest version".
- R7. Offline, GitHub rate limit, and a release with no `.apk` each show a clear message.
- R8. On web, Update does not download and does not open an installer.
- R9. The More Settings card subtitle is "Appearance, units, optional features, backups and updates".
- R10. A new install uses Purple. A saved accent id is unchanged. Purple keeps white on-color and still clears about 3:1 on the fill, on white, on the dark card, and on the light page background.
- R11. `app.json` and `package.json` are `1.1.2`. Android `versionCode` is 13. Release notes live with the other version notes. `README.md` is unchanged.

### Scope boundaries

- In scope: the Settings control, the pure checker, the Android download and installer handoff, the More subtitle, the default accent, the version bump, and the notes in `docs/SPEC.md`, `docs/PLAN.md`, `docs/INVENTORY.md`, and `docs/DESIGN.md`.
- Out of scope: background checks, Play Store, a billing SDK, nutrition, a new entitlement, a second import path, rotating the signing key, and `README.md`.

### Key Flows

- F1. Check. The user opens Settings and taps Check for updates. The result is up to date, an available release, or one of the R7 errors.
- F2. Install. From an available release the user taps Update. If installs from this app are not allowed, the screen opens the system setting and continues after the user comes back allowed. Otherwise it downloads with progress and opens the system installer.
- F3. New install. With no saved settings, the accent is Purple and the Purple tile says Default. A stored `green` (or any other known id) stays that id.

### Acceptance Examples

- AE1. Before the button press, no request is made. Covers R1.
- AE2. Installed `1.1.2` and latest `v1.1.1` shows "You're on the latest version". Installed `1.1.1` and latest `v1.2.0` with an `.apk` shows that version, the notes, and Update. Covers R2, R3, R6.
- AE3. A thrown fetch, a 403 rate-limit body, and a release whose assets are not `.apk` files show three different messages. Covers R7.
- AE4. On web, Update does not call the installer. Covers R8.
- AE5. Empty settings load Purple. Settings saved as Green stay Green. Covers R10.

## Planning Contract

### Key Technical Decisions

- **KTD1. The release check is a pure helper.** `src/lib/app-update.ts` takes the installed version and a `fetch` implementation. It does not import React or React Native. Version tags drop a leading `v` and compare numeric major.minor.patch, so `1.10` is newer than `1.9`. The `.apk` whose name is `my-recipe-app-<version>.apk` wins when several `.apk` assets exist; any other `.apk` is the fallback. A latest release older than the installed version is "up to date". Governs R1, R2, R3, R6, R7.
- **KTD2. Android install reuses the file-system content URI and the existing native package.** Download with `expo-file-system` `File.createDownloadTask` into the cache (progress callback, delete a previous file first). `File.contentUri` is `${applicationId}.FileSystemFileProvider`. A new `ApkInstall` module class in `modules/recipe-share` (already autolinked) checks `PackageManager.canRequestPackageInstalls()`, opens `Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES` for this package, and starts `ACTION_VIEW` with type `application/vnd.android.package-archive`, `FLAG_GRANT_READ_URI_PERMISSION`, and a clip grant to the resolved installer. The library manifest queries that VIEW intent so Android 11 can see the installer. `app.json` adds `android.permission.REQUEST_INSTALL_PACKAGES`. No second FileProvider. The same CI keystore signs the APK, which is what lets Android replace the installed app. Governs R4, R5, R8.
- **KTD3. Purple is the default id, not a new shade.** `DEFAULT_ACCENT` and `DEFAULT_SETTINGS.appearance.accent` become `purple`. The stored hex stays `#9D5DEE`. White on that fill is about 4.01:1. The shade is about 4.01:1 on white, 4.07:1 on `#1D211D`, and 3.73:1 on the light page `#F5F7F5`. `mergeAppearance` already keeps a known stored id and falls back to the default only when the stored id is missing or unknown. The "Default" caption moves from Green to Purple. Governs R10.

### Assumptions

- On web and iOS the check may still run when the user taps the button, because that is a public GET. Update does not download and does not open an installer (R8).
- Dev-only `?updatePreview=` on the Settings route renders the same status views for screenshots. Release builds (`__DEV__` false) ignore it. It is not a background check.
- `README.md` still says the next release is v1.1.0. It does not describe these features, so it stays (R11).

## Implementation Units

### U1. Pure update check

**Goal:** Version compare, asset pick, and error classification with no UI.

**Files:** `src/lib/app-update.ts`, `__tests__/app-update.test.ts`

**Approach:** Export `checkForUpdate`, the message strings, and the latest-release URL. Read the body once as text. Map thrown fetch to offline, 429 or a 403 rate-limit body or `x-ratelimit-remaining: 0` to rate limit, a release without an `.apk` to no asset, and anything else unreadable to a generic check failure.

**Test scenarios:**

- Happy path: `v1.2.0` with notes and `my-recipe-app-1.2.0.apk` is available over another `.apk`.
- Edge: installed equal or greater is up to date; `1.10.0` beats `1.9.9`; a missing installed version is an error.
- Error: thrown fetch; 403 rate-limit body; 429; 403 that is not a rate limit; assets with no `.apk`; non-JSON 200.
- Test file: `__tests__/app-update.test.ts`

### U2. Android download and installer handoff

**Goal:** Download the asset and open the system installer, or the unknown-apps setting.

**Files:** `src/lib/app-update-install.ts`, `modules/recipe-share/android/src/main/java/expo/modules/recipeshare/ApkInstallModule.kt`, `modules/recipe-share/src/index.ts`, `modules/recipe-share/expo-module.config.json`, `modules/recipe-share/android/src/main/AndroidManifest.xml`, `app.json`

**Approach:** `startApkInstall` returns `unsupported` unless `Platform.OS === 'android'`, before any native import. On Android, if `canRequestPackageInstalls()` is false, return `needs-permission` and do not download. Otherwise download to the cache with progress and call `installApk` with the content URI. Refuse a URI whose authority is not this app's file-system provider.

**Test scenarios:**

- Happy path: covered by the UI test with the installer mocked to report progress then `installed`.
- Edge: web and iOS return `unsupported` and do not import the native module.
- Error: a failed download surfaces the download message in the UI test.
- Test file: `__tests__/app-update-ui.test.tsx` and the unsupported case in `__tests__/app-update.test.ts`

### U3. Settings updater UI

**Goal:** The button, the four visible states, and the permission prompt, with no check on mount.

**Files:** `src/components/app-update-section.tsx`, `src/app/settings.tsx`

**Approach:** Local state only. Hooks stay above any return. No `useEffect` that calls `checkForUpdate`. While `needs-permission`, an `AppState` `active` event rechecks permission and continues the download if it is now allowed. The pending release is stored in a ref from the handler, not during render. Web Update returns immediately.

**Test scenarios:**

- Happy path: press shows up to date; press shows version, notes, and Update; mocked download shows a percent then the installer handoff.
- Edge: fetch is not called on mount; web Update does not call `startApkInstall`.
- Error: offline, rate limit, and no asset render their messages.
- Test file: `__tests__/app-update-ui.test.tsx`

### U4. More subtitle, purple default, version, notes

**Goal:** The copy, the default accent, and 1.1.2.

**Files:** `src/app/(tabs)/more.tsx`, `src/lib/theme.ts`, `src/types/recipe.ts`, `src/app/settings.tsx`, `src/storage/settings.ts`, `app.json`, `package.json`, `package-lock.json`, `docs/SPEC.md`, `docs/PLAN.md`, `docs/INVENTORY.md`, `docs/DESIGN.md`, `__tests__/appearance.test.tsx`, `__tests__/navigation.test.tsx`, `__tests__/v109-polish.test.ts`

**Approach:** Set `DEFAULT_ACCENT` to `purple` and use it in `DEFAULT_SETTINGS`. Move the Default caption. Give the More text column `minWidth: 0` so the longer subtitle wraps. Bump versions. Add a v1.1.2 section beside v1.1.1. Leave `README.md` alone.

**Test scenarios:**

- Happy path: empty storage is Purple and the Purple tile says Default; the header uses the purple primary; the More card has the full subtitle.
- Edge: a stored Green accent is still Green; an unknown stored accent falls back to Purple.
- Purple white on-color clears 3:1 on the fill, and the shade clears 3:1 on white, `#1D211D`, and `#F5F7F5`.
- `app.json` version is `1.1.2`, versionCode is 13, keyboard mode is still `resize`, and `REQUEST_INSTALL_PACKAGES` is requested.
- Test files: `__tests__/appearance.test.tsx`, `__tests__/navigation.test.tsx`, `__tests__/v109-polish.test.ts`, `__tests__/app-update.test.ts`

## Verification Contract

- `npm test`, `npm run lint`, and `npm run typecheck` pass.
- Open rendered screenshots at 360dp of Settings up to date, update available, downloading, and error, plus More and the purple default. Confirm each file is the screen, not an error overlay.
- The recipes-first and entitlements suites stay green. The updater is not a gated feature.

## Definition of Done

- R1–R11 have a passing test or an opened screenshot named beside the checklist in the pull request.
- Lessons from this run are in `LESSONS.md` and under `Lessons learned` in the pull request.
- CI on the pull request is green, the squash-merge is on `main`, the tag `v1.1.2` has a successful release run, and the release asset is `my-recipe-app-1.1.2.apk`.

## Assumptions

Headless run: the product forks above are recorded here and are not re-asked. The dev preview query is for screenshots only.
