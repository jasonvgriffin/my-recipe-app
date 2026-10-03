# Design rules (all feature agents must follow)

## 0. RECIPES ARE THE CORE

Recipes are the product; pantry, meal plan, shopping list, grocery run, receipt/barcode scanning and household
sharing are optional. App opens to Recipes; no onboarding/sign-in/setup; no recipe flow requires or prompts
optional features; cross-links are unobtrusive and absent when the feature is hidden (`useSettings().features`)
or empty; empty optional features never nag; Settings toggles hide the optional tabs. Recipe features get
verification priority. Acceptance: full recipe workflow with all optional features hidden
(`__tests__/recipes-first.test.tsx`). Full rule: top of docs/SPEC.md.

These rules apply to every screen and PR. They come from Jason's v1 spec (docs/SPEC.md) — notably
#13 dark theme, #23 foldables, #24 cook-with-me, #25 household sharing, #27 barcode lookup.

## 0b. Paywall-ready feature gating

Every optional feature has a `FeatureId` in `src/entitlements/features.ts` and every entry point checks it:
UI via `useFeature` / `useFeatureVisible` / `<FeatureGate>`, modules via `canUse` (inject `canUse` in deps
for tests). Gate ≠ Settings toggle (need both). Core recipe CRUD/view/search is never gated. v1 config is all
free with `LocalFreeEntitlements`; no billing SDK or payment UI. Test: `__tests__/entitlements.test.tsx`.
Full rule: top of docs/SPEC.md.

## 1. Dark theme (spec #13)

- Dark by default and throughout. Use `colors` / `navigationTheme` from `src/lib/theme.ts`; never hard-code
  light colors. Inputs use `colors.input` + `placeholderTextColor={colors.placeholder}`.

## 2. Foldables & large screens (spec #23)

Target: Android foldables (e.g. Pixel Fold / Galaxy Z Fold) first, plus tablets.

**Window size classes (width, dp)** — via `useWindowSizeClass()` from `src/hooks/use-window-size-class.ts`
(built on `useWindowDimensions`; never read `Dimensions` directly):

| Class    | Width   | Typical device                                  | Layout                                       |
| -------- | ------- | ----------------------------------------------- | -------------------------------------------- |
| compact  | < 600   | phone, folded foldable                          | single pane, bottom tabs, push detail routes |
| medium   | 600–839 | unfolded book foldable (portrait), small tablet | **two panes side-by-side**, bottom tabs      |
| expanded | ≥ 840   | unfolded landscape, tablet                      | two panes + **side navigation rail**         |

**Live adaptation:** layouts must adapt when the device folds/unfolds or the window is resized
(multi-window) — no restart, no lost state. The Activity already handles `screenSize|smallestScreenSize|
screenLayout|orientation` config changes (Expo default; verified in the prebuilt manifest), `app.json`
has `orientation: "default"` and doesn't lock resizing. Keep state in parents / stores, not in pane-specific
components that unmount, and keep the primary pane at a stable position in the tree (`TwoPaneLayout` does).

**Two-pane layouts** — use `TwoPaneLayout` from `src/components/layout.tsx`:

| Screen        | Primary       | Secondary (medium/expanded)    | Compact                         |
| ------------- | ------------- | ------------------------------ | ------------------------------- |
| Recipes       | recipe list   | recipe detail (`RecipeDetail`) | list → push `/recipe/[id]` ✅   |
| Meal plan     | calendar      | selected day's plan            | calendar → day route            |
| Shopping list | shopping list | pantry (spec #21)              | list; pantry via its own screen |
| Cooking mode  | steps         | ingredients for the step       | stacked (`compact="stack"`) ✅  |

**Max widths:** never stretch content across a wide/unfolded screen (or the hinge). Wrap single-pane screen
bodies in `MaxWidthContainer` (`MAX_CONTENT_WIDTH.text` 720, `.list` 560, `.form` 640); the secondary pane is
capped automatically.

**Navigation:** bottom tabs in compact/medium; side rail (`tabBarPosition: 'left'`) in expanded — already
wired in `src/app/(tabs)/_layout.tsx`.

**Acceptance criteria (every screen):** a test in `__tests__/responsive.test.tsx` renders the screen at
**compact (411dp)** and **expanded (900dp)** widths and asserts the right panes/content (mock width via the
`useWindowSizeClass` mock already in that file). A PR adding/changing a screen without this test is incomplete.

## 3. Logic lives in UI-free modules

Screens stay thin. Shared logic goes in pure, tested modules that a future MCP server can reuse:

- `src/import/` — the ONLY way recipes enter the app (docs/IMPORT_API.md)
- `src/cooking/` — cook-with-me session state (docs/COOK_API.md)
- `src/sync/` + `src/storage/` — repositories and household sync (docs/SYNC.md)
- `src/entitlements/` — feature gate (`canUse`, registry, providers)
- `src/pantry/` — barcode lookup (Open Food Facts + local/household cache); receipt parsing goes here too
  ESLint forbids React / react-native / expo imports inside those modules.

## 4. Voice / assistant friendliness (spec #24)

No in-app TTS. Anything an assistant might do ("send this recipe", "next step") must be reachable through a
UI-free module + a deep link (`myrecipeapp://…`), so the future MCP server can wrap the same functions.

## 5. Household-ready data (spec #25)

Every synced record extends `SyncMeta` (UUID `id`, `householdId?`, `createdBy?`, `createdAt`, `updatedAt`,
`deletedAt?`). Write through the repositories (`Collection.save/remove`) — never `replaceAll` for user edits —
so timestamps, authorship and tombstones stay correct. The app must work fully offline/solo when signed out.

## 6. Accessibility & touch

- Touch targets ≥ 44dp; `accessibilityRole` on custom buttons; text scales with system font size.
- Cooking mode: large text (≥ 24sp step text), high contrast, operable with wet hands (big buttons).

## 7. Product rules

Diabetic-friendly, low-carb; **allulose is the only sugar-free sweetener — never monk fruit**; never default
unknown carbs/nutrition to 0.
