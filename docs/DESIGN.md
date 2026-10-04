# Design rules (all feature agents must follow)

## 0. RECIPES ARE THE CORE

Recipes are the product; pantry, meal plan, shopping list, grocery run, barcode scanning
are optional. App opens to Recipes; no onboarding/sign-in/setup; no recipe flow requires or prompts
optional features; cross-links are unobtrusive and absent when the feature is hidden (`useSettings().features`)
or empty; empty optional features never nag; Settings toggles hide the optional tabs. Recipe features get
verification priority. Acceptance: full recipe workflow with all optional features hidden
(`__tests__/recipes-first.test.tsx`). Full rule: top of docs/SPEC.md.

These rules apply to every screen and PR. They come from Jason's v1 spec (docs/SPEC.md) — notably
#13 dark theme, #23 foldables, #24 cook-with-me, ~~#25 household sharing~~ (removed in v1.0.6), #27 barcode lookup.

## 0b. Paywall-ready feature gating

Every optional feature has a `FeatureId` in `src/entitlements/features.ts` and every entry point checks it:
UI via `useFeature` / `useFeatureVisible` / `<FeatureGate>`, modules via `canUse` (inject `canUse` in deps
for tests). Gate ≠ Settings toggle (need both). Core recipe CRUD/view/search is never gated. v1 config is all
free with `LocalFreeEntitlements`; no billing SDK or payment UI. Test: `__tests__/entitlements.test.tsx`.
Full rule: top of docs/SPEC.md.

## 1. Theme (spec #13; Appearance since v1.0.3)

- Settings → Appearance: theme mode System / Light / Dark (default System; System follows the phone, unknown →
  dark) and an accent color (Green = original look, Orange, Blue, Purple, Red, Teal; v1.0.5 adds Pink, Amber, Indigo, Brown, Lime, Slate). Saved in local settings
  (`AppSettings.appearance`); free, not gated.
- Palettes: `src/lib/theme.ts` (`buildColors(scheme, accent)`). v1.0.9 uses one shade per accent in both modes
  (about 3:1 on white and on the dark card). See §8. Checked in `__tests__/appearance.test.tsx`. Components read colors only via
  `const useStyles = makeStyles((colors) => ({ … }))` + `useStyles()`, or `useColors()` for inline colors
  (`src/hooks/use-theme.tsx`, `AppThemeProvider` in `src/app/_layout.tsx`). Never hard-code colors; the test fails
  on hex/rgba literals outside `src/lib/theme.ts` (the printable PDF in `src/lib/recipe-pdf.ts` is exempt: always
  black on white). Inputs use `colors.input` + `placeholderTextColor={colors.placeholder}`.
- Edge-to-edge: stack screens sit in `SystemNavFrame`, which pads the viewport by the safe-area bottom inset
  (so `useBottomInset()` is 0 there and padding is not doubled). Bottom-tab scenes already end above the in-flow
  tab bar; `useBottomInset()` there is `TAB_PLUS_CLEARANCE` (32dp) so content clears the raised +. The nav rail
  (expanded) gets the safe-area inset.

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
- `src/storage/` — repositories over a swappable KeyValueStore (sync and households were removed in v1.0.6)
- `src/entitlements/` — feature gate (`canUse`, registry, providers)
- `src/pantry/` — barcode lookup (Open Food Facts + local cache); shared by the pantry and shopping-list scanners (`src/components/barcode-scanner.tsx`)
  ESLint forbids React / react-native / expo imports inside those modules.

## 4. Voice / assistant friendliness (spec #24)

No in-app TTS. Anything an assistant might do ("send this recipe", "next step") must be reachable through a
UI-free module + a deep link (`myrecipeapp://…`), so the future MCP server can wrap the same functions.

## 5. Record metadata (household sharing removed in v1.0.6)

Every stored record extends `SyncMeta` (UUID `id`, legacy `householdId?` / `createdBy?`, `createdAt`, `updatedAt`,
`deletedAt?`). Write through the repositories (`Collection.save/remove`) — never `replaceAll` for user edits —
so timestamps, authorship and tombstones stay correct. The app is fully local (no sign-in since v1.0.6).

## 6. Accessibility & touch

- Touch targets ≥ 44dp; `accessibilityRole` on custom buttons; text scales with system font size.
- Cooking mode: large text (≥ 24sp step text), high contrast, operable with wet hands (big buttons).

## 7. Product rules

Diabetic-friendly recipes; **allulose is the only sugar-free sweetener — never monk fruit**. This is a recipe app, not a nutrition app. Do not add nutrition features (recipes, pantry, or anywhere) unless Jason explicitly asks; apps like Cronometer and MyFitnessPal cover nutrition.

## 8. Visual design (v1.0.9)

Read this before any UI change. Tokens live in `src/lib/theme.ts`. Screens read them through `makeStyles` / `useColors`. A test fails if `src/` hard-codes a color outside that file (the printable PDF is the one exemption: always black on white).

### Color

- One hex per accent, used in light and dark. Each clears about 3:1 on `#FFFFFF` and on the dark card `#1D211D`.

| Accent | Hex | On-color |
| --- | --- | --- |
| Green | `#3C8F40` | white |
| Orange | `#CF5D00` | white |
| Blue | `#1981DC` | white |
| Purple | `#9D5DEE` | white |
| Red | `#E6423F` | white |
| Teal | `#008F80` | white |
| Pink | `#EB3271` | white |
| Amber | `#C1810A` | dark `#121412` |
| Indigo | `#6C7AC6` | white |
| Brown | `#AC714F` | white |
| Lime | `#58A018` | dark `#121412` |
| Slate | `#69838F` | white |

- On-color rule: dark on Amber and Lime, white on the other ten. The center + glyph uses that on-color.
- `accent` / `accentText` are aliases of `primary` / `primaryText`. Do not introduce a second accent color.
- Badges stay `#E53935` with white text (`badge` / `badgeText`) in every accent and mode. A white `badgeRing` keeps a badge visible when Red is selected. The advanced-search dot uses that fill and ring, plus a `colors.card` halo, so the red center still reads on a Red accent button.
- Switches stay green. Trash icons go neutral while Red is selected (`dangerIcon`).

### Always use theme tokens

Never hard-code hex, rgb, or named colors in screens or components. If a color is new, add a token in `src/lib/theme.ts`.

### Text never truncates

Do not ellipsize tab or button labels. Shrink to fit (`adjustsFontSizeToFit`, `minimumFontScale` 0.85) and remove horizontal padding before shortening the words.

### Tab bar

| Piece | Size |
| --- | --- |
| Bar height | 80dp, plus the safe-area inset |
| Icons | 24dp |
| Labels | 13sp, shrink-to-fit down to 0.85, one line, no horizontal item padding |
| Center + | 52dp circle (`plus`); the raised bottom-bar style overrides that to 58dp. 31dp glyph, filled with the main accent |

The + slot is only as wide as the button (58dp, `flexGrow`/`flexShrink` 0, `flexBasis` 58). Do not use the `flex: 0` shorthand: on web it is flex-basis 0% and the slot collapses, so the circle overlaps Shopping. A custom `tabBarButton` has to apply the `style` prop the navigator passes, or the inner padding is dropped. The width itself lives on `tabBarItemStyle` (the outer item).

### Spacing

Use the existing scale: 4, 8, 12, 16, 24. Touch targets are at least 44dp. Shopping List’s Scan Item, Build from Meal Plan, and View Shopping List are about 78% of the content width (max 420) and centered, with 14dp between them.

### Keyboard

`android.softwareKeyboardLayoutMode` is `resize`. Every screen with a TextInput uses `KeyboardAwareScrollView`, `KeyboardAwareFlatList`, or `KeyboardAvoidingView` from `src/components/layout.tsx` so the focused field scrolls above the keyboard. Typing in one field must not hide a nearby button.
