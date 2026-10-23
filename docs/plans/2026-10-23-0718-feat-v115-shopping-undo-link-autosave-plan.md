---
title: Shopping list without Undo and auto-save link import - Plan
type: feat
date: 2026-10-23
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
depth: standard
---

# Shopping list without Undo and auto-save link import - Plan

## Goal Capsule

**Objective:** Jason checks items off the shopping list without an Undo button, and a recipe link he imports is already saved when he lands on it.

**Means:** Remove the grocery-run undo control and its stack. A URL import persists through the existing `importRecipe` write, then opens the recipe. Pasted text still waits for Save (KTD1, KTD2).

**Authority:** Product behavior lives on the R-IDs. Mechanism lives on the KTDs. A session-settled label outranks a later convenience.

**Stop:** Do not tag or publish. Do not change Add recipe. Do not change pasted-text Save, PDF import, or the shopping-tab list. Do not add nutrition.

**Execution profile:** One feature branch off current `origin/main`. Test-first for the two behavior changes. `npm run typecheck`, `npm test`, and `npm run lint` before done. Screenshots of the checklist and the saved recipe at 360dp and the default width, each opened before they are attached.

## Product Contract

### Summary

v1.1.5 removes the Undo button from the full-screen shopping checklist and saves a link import as soon as that import succeeds. The version is 1.1.5, Android versionCode 16.

### Problem Frame

The checklist shows Undo above the items even when there is nothing to undo. Jason wants that control gone. A link import still stops on a draft and a pinned Save, which he no longer wants. Pasted text and a recipe typed in by hand are not part of that complaint.

### Key Decisions

- KD1. A link import saves on success and opens that recipe. (session-settled: user-directed — chosen over the v1.1.1 pinned Save: Jason reversed that confirm step for link imports.) Governs R2, R3, R4.
- KD2. The checklist has no Undo. Checking and unchecking stay on the row checkbox. Governs R1. This was a directive. The one challenge is that Undo can replay a stack of checks, while a second tap only flips the row you touch. That stack is not required: each row still toggles. The button goes.

### Requirements

- R1. The shopping checklist (header `Shopping List · N/M`, progress `N of M`) has no Undo control. Checking a row marks it and updates progress. Tapping that row again clears it. Notes still open without toggling the row. The screen stays awake. The list stays one flat list.
- R2. Tapping Import link on a new recipe link saves that recipe and opens its detail screen. There is no Save recipe and no Save and edit step on that path. The detail screen is the normal one, so the recipe can be edited from there.
- R3. A failed link import saves nothing and stays on the import screen with the existing error for that failure (empty link, fetch failure, no recipe, save failure).
- R4. A link that is already stored does not write a second recipe. The screen opens the existing recipe.
- R5. Pasted text still previews as a draft, still uses the pinned Save and Save and edit, still warns on leave, and still clears the draft when the text or the link field changes before Save.
- R6. Add recipe still requires its own Save recipe. PDF import is unchanged.
- R7. The app reports 1.1.5 and Android versionCode 16. README, SPEC, INVENTORY, PLAN, and the import contract describe the new behavior in their current voice. No release tag.

### Actors

- A1. Jason, on the phone, checking items and importing a link.

### Flows

- F1. Open the checklist, check an item, check it again. Progress goes up, then back down. Undo is absent.
- F2. Paste a new recipe URL, tap Import link, land on the saved recipe. Leave and the recipe is in the list.
- F3. Tap Import link on a bad URL or an empty field. Stay on the import screen, see the error, and have no new recipe.
- F4. Tap Import link on a URL already stored. Land on that recipe. The list length is unchanged.
- F5. Paste recipe text, tap Import text, tap Save recipe. That path still confirms before writing.

### Acceptance Examples

- AE1. Four unchecked items. The header can read `Shopping List · 0/4` and the progress reads `0 of 4`. No Undo button is on screen. After one check, progress reads `1 of 4`. After the same row is tapped again, it reads `0 of 4`.
- AE2. Import link for a page titled Imported eggs. The next screen is that recipe's detail. The store has one recipe with that source URL. Save recipe is not shown on the import step.
- AE3. Import link while offline. The fetch error is visible. The store is unchanged. The detail screen is not open.
- AE4. Import text for a pasted recipe still shows Draft and does not write until Save recipe.

### Success Criteria

Jason can finish a shop without Undo, and a successful link import is in the recipe list when the detail screen appears. Typecheck, tests, and lint pass.

### Scope Boundaries

In scope: grocery-run checklist UI and its undo state, the import screen's URL path (Import link, a `?url=` deep link, and a shared URL), version files, and the docs that describe those behaviors.

Out of scope: the shopping tab (build list, manual rows, clear checked), Add recipe, Import text, Import PDF, `importRecipe`'s function signature, nutrition, sync, and publishing a release.

### Assumptions

- A "link import" is every `kind: 'url'` entry on the import screen: the Import link button, `myrecipeapp://import?url=…`, and a shared string that is an http(s) URL. A shared or deep-linked blob of recipe text stays a draft.
- A duplicate link opens the existing detail screen immediately. The "Already in your recipes" card is not shown for that URL path, because the user is already on the recipe.
- Field edits, a newer URL tap, and leaving the import screen cancel a link import that has not started its persisting `importRecipe` call. That cancel stores nothing, opens nothing, and does not show an error for the dropped request. Once that call has started, a finished write is kept. Navigation to the recipe happens only while the import screen is still mounted. A second URL start waits until the in-flight persist settles, so two overlapping writes cannot store the same link twice.
- The manual Add recipe screen does not share the import screen's Save bar, so it does not change.

### Outstanding Questions

None blocking. Duplicate navigation and which URL entry points auto-save are assumptions above, not open product forks.

## Planning Contract

### Key Technical Decisions

- KTD1. Persist a URL with the existing non-dry-run `importRecipe`, after a dry run that is still the latest request. Do not add a second import API. The dry run is what makes an edit or a second tap cancel the write before it starts. `importRecipe` saves inside the non-dry-run call, so staleness cannot be checked mid-save. Governs R2, R3, R4. Instantiates KD1.
- KTD2. Delete `undoStack`, `undo`, `canUndo`, `onUndo`, the Undo `Pressable`, and the undo styles. Toggle stays `setItemChecked` plus `mealPlanStore.saveShoppingList`. Uncheck is another toggle of that row. Governs R1. Instantiates KD2.
- KTD3. Reuse the import screen's existing commit for the URL write, forced to open detail (`mode: 'open'`), including the current remote-photo download. Text Save and Save and edit keep calling it with `open` and `edit`. A URL success never sets the leave-warning flag. Governs R2, R5.
- KTD4. Version bump is `app.json` `expo.version` `1.1.5` and `android.versionCode` `16`, plus `package.json` and the lockfile root `version`. `softwareKeyboardLayoutMode` stays `resize`. No git tag. Governs R7.

### High-Level Technical Design

URL import states, directional only:

```text
idle
  -> busy (dry run) on Import link, ?url=, or a shared URL
busy
  -> idle + the existing error, nothing stored, when that latest dry run fails
  -> idle, nothing stored, no error, when the dry run is stale
  -> navigate to existing detail, when the dry run is a duplicate and still current
  -> persist, when the dry run created a recipe, is still current, and no persist is already running
persist
  -> detail, when the write succeeds and the import screen is still mounted
  -> idle + error, nothing new stored, when the write throws
  -> keep the recipe and do not navigate, when the write succeeds after the screen was left
```

Pasted text stays idle -> draft + pinned Save -> detail or editor. The shopping checklist has items and progress only. There is no undo state.

### Sequencing

U1 and U2 are independent. U3 follows them so the docs describe the behavior that shipped. Fetch `origin/main` before branching. The VM snapshot can be behind the remote.

## Implementation Units

### U1. Remove checklist Undo

**Goal:** The grocery-run screen checks and unchecks with no Undo control and no leftover undo state.

**Requirements:** R1, AE1, KD2, KTD2.

**Execution note:** Test-first. Change the grocery-run test so it fails while Undo is still required, then remove the control.

**Files:** `src/components/grocery-run-view.tsx`, `src/app/grocery-run.tsx`, `__tests__/plan-shop-ui.test.tsx`.

**Approach:** Drop the undo props and the header button. `toggle` only flips `item.checked` and saves the list. Keep progress, the awake hook, notes, quantity, and the flat list.

**Test scenarios:**

- A week checklist renders `0 of N`, has no `grocery-undo`, and does not show the word Undo. Checking the green-beans row makes progress `1 of N` and persists. Pressing that row's checkbox again makes progress `0 of N`.
- The notes row still opens Party size without calling toggle, and the checkbox still toggles once.
- A recipe checklist still lists its items and has no Undo button.

**Verification:** The grocery-run tests in `__tests__/plan-shop-ui.test.tsx` pass. No remaining `canUndo` / `onUndo` / `grocery-undo` in `src/`.

### U2. Auto-save link imports

**Goal:** A successful URL import is stored and opened with no Save step. Failures store nothing. Pasted text is unchanged.

**Requirements:** R2, R3, R4, R5, R6, AE2, AE3, AE4, KD1, KTD1, KTD3.

**Execution note:** Test-first in `__tests__/recipe-core-ui.test.tsx`. The current test expects a draft and a Save tap for links. That assertion fails first. Then change the screen.

**Files:** `src/app/import.tsx`, `__tests__/recipe-core-ui.test.tsx`. Do not edit `src/app/add.tsx` or `src/import/import-recipe.ts` unless a test proves the screen cannot meet R2 without it.

**Approach:** Route `kind: 'url'` through dry run, then the existing commit at `open` when the request is still current, the status is not duplicate, and no persist is already running. A current duplicate replaces to `/recipe/[id]` for `draft.recipe.id` and does not call save again. Do not show the draft card or the save bar for a URL that is about to navigate. Keep `requestRef` so an edit, a newer tap, or leaving the screen drops a stale dry run before persist. A stale drop does not set an error. While the persisting call is in flight, ignore further URL starts. After it succeeds, navigate only if this screen is still mounted. If it succeeds after the user left, keep the recipe and do not pull them back. Text, the text leave alert, and the disabled Save after a cleared text draft stay. A URL path does not show that leave alert.

**Test scenarios:**

- Import link on `https://example.com/eggs` with the existing microdata fixture writes one Imported eggs recipe, opens `recipe-detail`, and never shows `import-save` or Draft. The source URL is stored.
- Empty Import link shows `import-error-invalid_input`, no draft, store length 0.
- A rejected fetch shows `import-error-fetch_failed`. A page with no recipe shows `import-error-no_recipe_found`. Store length stays 0. Detail is not open.
- `recipeStore.save` rejecting on the persisting call shows `import-error-save_failed`, stays off detail, store length 0.
- A URL edited before the dry run resolves does not write, does not open detail, and does not show an error for the dropped request.
- Leaving the import screen during the dry run stores nothing and does not open detail later.
- A second Import link tap while the persisting call is in flight does not start another write. When that call finishes on the same URL, one recipe exists.
- An existing source URL opens that recipe's detail, does not add a row, and does not alert on the way there.
- Import text still shows Draft, writes only on Save recipe, and Save and edit still opens the editor.
- Changing the text after a text preview still disables Save and writes nothing. Leaving a text draft still alerts Keep editing / Discard / Save.
- A `?url=` open follows the same save-and-open path.
- Add recipe's Save recipe test is left as it is and still passes.

**Verification:** `__tests__/recipe-core-ui.test.tsx` and `__tests__/recipes-first.test.tsx` pass.

### U3. Version 1.1.5 and the docs

**Goal:** The app and the docs say 1.1.5 / versionCode 16 and describe R1–R7.

**Requirements:** R7, KTD4.

**Files:** `app.json`, `package.json`, `package-lock.json` (root version only), `__tests__/v109-polish.test.ts`, `__tests__/app-update.test.ts`, `README.md`, `docs/SPEC.md`, `docs/INVENTORY.md`, `docs/PLAN.md`, `docs/IMPORT_API.md`.

**Approach:** Bump the version fields the two tests already read. In SPEC, row 1 says a link import saves and opens the recipe, and pasted text still waits for Save. Row 18 drops undo. Add a v1.1.5 section in the same shape as v1.1.4. INVENTORY's feature rows and a v1.1.5 additions block match. PLAN gets a v1.1.5 paragraph. IMPORT_API's deep-link status and the comment that the screen always previews then confirms become: URL imports save on success; text still previews. README's versioning paragraph names v1.1.5 (versionCode 16) and a short first-person shipped list for this version only. Do not rewrite the portfolio voice.

**Test scenarios:**

- `app.json` version is `1.1.5`, versionCode is 16, and `softwareKeyboardLayoutMode` is still `resize`.
- The app-update manifest test expects the same pair.

**Verification:** Those two tests pass. `rg` of `1.1.4` in README, SPEC, INVENTORY, and PLAN shows only historical release notes, not the current version.

## Verification Contract

- `npm run typecheck`
- `npm test`
- `npm run lint`
- Web render of the checklist with items and no Undo, at 360px wide and at the default width. Open each image file and confirm it is the checklist, not an error overlay.
- Web render of a recipe detail reached by a successful Import link, at both widths. Open each image the same way.
- `recipes-first` stays green with optional features hidden.

## Definition of Done

- U1. Undo is gone, check and uncheck work, dead undo code is gone.
- U2. Link success saves and opens the recipe. Link failure saves nothing and shows the error. Text import and Add recipe behave as before.
- U3. Version is 1.1.5 / 16. Docs match. No tag, no publish.
- Typecheck, test, and lint passed on the branch.
- Four screenshots (checklist and saved recipe, each at 360dp and default width) were opened and attached to the PR.
- New lessons, if any, are in `LESSONS.md` and under Lessons learned in the PR.

## Appendix

### Research

External research skipped. The checklist and the import screen already implement both behaviors. `docs/solutions/` is empty and no Compound packs are configured. Slack was not requested.

Undo lives only in `src/app/grocery-run.tsx` (`undoStack`, `undo`) and `src/components/grocery-run-view.tsx` (the Undo `Pressable`, test id `grocery-undo`). `__tests__/plan-shop-ui.test.tsx` presses that button to return progress to `0 of`. The shopping tab has no Undo. Backup copy that says a restore cannot be undone is unrelated.

`src/app/import.tsx` `preview` always calls `importRecipe` with `dryRun: true`. Save calls `commit`, which calls `importRecipe` again without dry run, downloads a remote photo when that feature is on, and `router.replace`s to detail or the editor. `leaveRef` warns only for a non-duplicate draft. `__tests__/recipe-core-ui.test.tsx` covers draft, Save, Save and edit, errors, duplicate notice, and the leave alert. `src/import/import-recipe.ts` returns `duplicate` before `store.save`. Dry run does not save. Add recipe is `src/app/add.tsx` and is what `recipes-first` saves through.

Version assertions: `__tests__/v109-polish.test.ts` and `__tests__/app-update.test.ts` expect `1.1.4` and versionCode 15.

### Directive challenge

Removing Undo loses a multi-step stack. Each row still toggles, which is the reversal Jason asked to keep. No settled decision was invalidated.
