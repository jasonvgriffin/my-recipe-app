---
title: Meal plan day save and custom entries - Plan
type: feat
date: 2026-10-15
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
depth: standard
---

# Meal plan day save and custom entries - Plan

## Goal Capsule

**Objective:** Jason can save a planned meal and land back on the calendar, and he can plan a meal that is not a saved recipe.

**Means:** Keep the existing day-screen draft for recipes. Collapse the add section behind two buttons. Store a custom meal as a meal-plan row with a title and no recipe id (KTD1, KTD2).

**Authority:** Product behavior lives on the R-IDs. Mechanism lives on the KTDs.

**Stop:** Do not add servings to a custom meal. Do not bump the backup file version. Do not tag a release. Do not merge the pull request.

**Execution profile:** One feature branch. Tests for collapse, custom save, navigation, old rows, and backup. Renders at 360dp and the default width.

## Product Contract

### Summary

v1.1.3 changes the meal-plan day screen. Save on a planned recipe returns to the calendar. Add a recipe and Add custom entry start collapsed. A custom entry is free text plus the same category chips, and it saves, shows, removes, and restores like a recipe entry.

### Problem Frame

Saving a recipe on the day screen leaves Jason on that screen. An empty day always shows the add-a-recipe form. He cannot plan a pantry item or something store-bought.

### Requirements

- R1. Tapping Save on a planned-recipe card writes the entry and returns to the Meal Plan calendar.
- R2. On the day screen, Add a recipe is a button. It starts collapsed. Tapping it shows the existing chips, servings field, search, and recipe list.
- R3. Add custom entry is a second button. It starts collapsed. Tapping it shows a free-text field, the same category chips, and Save.
- R4. A custom entry is a meal that is not a saved recipe. Saving it writes it to that day and returns to the calendar.
- R5. A saved custom entry shows on the day screen and on the calendar cell, and it can be removed.
- R6. Existing meal-plan rows and old backups still load. A backup that includes a custom entry still loads on 1.1.3.
- R7. The app version is 1.1.3 and Android versionCode is 14.

### Key Decisions

- KTD1. A custom entry omits `recipeId` and stores `title`. An empty `recipeId` would look like a missing recipe to older builds. Governs R4, R5, R6.
- KTD2. `BACKUP_VERSION` stays 1. The backup schema is already a loose record. A higher version would make 1.1.2 refuse the whole file. Governs R6.
- KTD3. Navigation after Save is on the day route only. The wide layout already shows the calendar beside the day, so Save there stays on the day. Governs R1, R4.
- KTD4. The two add buttons are exclusive. Opening one closes the other. Both start closed, including when the day already has meals. A pending recipe card still hides both. Governs R2, R3.
- KTD5. A custom entry has no servings stepper. Shopping ignores it. Category chips, day move, and Remove match a saved recipe card. Governs R3, R5.

### Assumptions

- A4 is the wide-layout reading of "return to the calendar": the calendar pane is already on screen, so Save does not call `router.back()`.

### Scope Boundaries

- No nutrition fields.
- No edit of a custom title after save. Remove and add again.
- No second meal-plan store or screen.

### Acceptance Examples

- AE1. Empty day shows Nothing planned, Add a recipe, and Add custom entry. Search and the custom field are absent until their button is tapped.
- AE2. Save on a compact day route returns to the calendar path. The entry is stored.
- AE3. Save custom "Rotisserie chicken" under Lunch stores `{ title, slot }` and no `recipeId`. The calendar cell shows that title. Remove deletes it.
- AE4. A stored row `{ id, date, recipeId: "r1", slot: "dinner" }` still loads. A backup round-trip keeps both that row and a custom row.

## Implementation Units

### U1. Custom meal data

**Goal:** A meal-plan row can be a recipe or a title, and old rows still load.

**Files:** `src/types/meal-plan.ts`, `src/storage/meal-plan.ts`, `src/lib/meal-plan.ts`, `src/lib/shopping.ts`, `__tests__/plan-shop.test.ts`, `__tests__/backup.test.ts`

**Approach:** Make `recipeId` optional. Add optional `title`. `isMealPlanEntry` accepts a non-empty recipe id or a non-empty title. `placeCustomEntry` trims the title and omits `recipeId`. `mealEntryCalendarTitle` returns the recipe title, or the custom title, or nothing when the recipe is gone. Shopping skips a row with no recipe id.

**Test scenarios:**
- Old dinner row with only `recipeId` loads.
- A row with neither id nor title is dropped.
- `placeCustomEntry` stores the trimmed title and no `recipeId`. A blank title is not stored.
- Calendar title helper prefers the recipe title when `recipeId` is set.
- A week list built from only a custom row has no items.
- Backup export and replace restore keep a recipe row and a custom row.

### U2. Day screen

**Goal:** The add tools start collapsed, and Save returns to the calendar on the phone route.

**Files:** `src/components/day-plan.tsx`, `src/components/meal-calendar.tsx`, `src/app/meal-plan/[date].tsx`, `__tests__/plan-shop-ui.test.tsx`

**Approach:** Two full-width buttons use the accent border and fill with the accent when open. The recipe block is the existing chips, servings, search, and list. The custom block is a text field and the same chips. Save for a custom entry sits in the existing bottom bar and is disabled until the text is non-blank. The day route passes `onSaved` that goes back, or replaces `/meal-plan` when there is no history. The wide pane does not pass `onSaved`. A custom card shows title, chips, day move, and Remove, and no servings row. The calendar cell uses `mealEntryCalendarTitle`.

**Patterns:** `SlotChip`, `colors.primary` / `colors.primaryText`, `KeyboardAwareScrollView`, pending meal outside the pane.

**Test scenarios:**
- Search and the custom field are absent until their buttons are pressed. Opening one hides the other.
- Existing recipe save, move, and remove still work. On compact, Save returns to `/`.
- Custom save on compact returns to `/` and the cell shows the title. Reopening the day shows the title and Remove, and no servings line.
- A blank custom Save does not write a row.

### U3. Version and docs

**Goal:** The app reports 1.1.3 / versionCode 14, and the spec names the new day-screen behavior.

**Files:** `app.json`, `package.json`, `package-lock.json`, `docs/SPEC.md`, `docs/PLAN.md`, `docs/INVENTORY.md`, `docs/BACKUP.md`, `__tests__/v109-polish.test.ts`, `__tests__/app-update.test.ts`

**Test scenarios:**
- `app.json` version is 1.1.3, versionCode is 14, and the keyboard mode is still `resize`.

## Verification

Render the day screen at 360dp and at the default width: collapsed, Add a recipe open, Add custom entry open, a saved custom entry on the day, and the calendar after Save. Open each screenshot. Run typecheck, lint, and tests.
