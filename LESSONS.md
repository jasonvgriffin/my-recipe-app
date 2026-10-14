# LESSONS.md: My Recipe App

Read this before every build. Add a dated lesson after each version: what went wrong, the rule that prevents it.
General lessons that apply to any app are copied into the last section of this file from Eve's shared skill, which cloud agents can't read directly. When you find a lesson that applies to any app, add it under General lessons and mention it in your PR so Eve can sync it to the shared skill.

## Working with Eve

Jason asked the coding agent to get better with Eve as we go. The loop is:

- Read this file before writing code. Follow every rule in it.
- When a review or a bug shows a rule that would have prevented it, add that lesson here in the same change. One rule, what went wrong, the version.
- Recipe-app rules stay in this file (layout, theme, no nutrition, recipes first). Diabetic-friendly means track servings. There is no house sweetener restriction.
- A rule that would apply to any of Jason's apps goes under General lessons at the end of this file and under `Lessons learned` in the PR description, so it can be copied to app-build-lessons and the other repos.
- If app-build-lessons is not installed in the environment, follow this file and say that the shared skill was missing. Do not invent a second lessons file.

## Layout and screens
- **Verify layout from a real render, never width math.** (1.0.8: tab labels "Meal Plan"/"Shopping" passed the math but were truncated on Jason's phone.) Render key screens at 360dp wide and at the default width, attach screenshots to the PR.
- **Text must never truncate.** Tab/button labels: allow shrink-to-fit (adjustsFontSizeToFit, minimumFontScale ~0.85) and remove default horizontal padding before shortening text.
- **Keyboard must never cover the field being typed in.** Every screen with a TextInput needs keyboard avoidance (KeyboardAvoidingView / scroll-to-input) and `android.softwareKeyboardLayoutMode: "resize"`. Test with the keyboard open. (1.0.8: Samsung Keyboard covered New category.)
- **Keep controls visible while editing.** Typing in one field must not hide nearby buttons (1.0.8: "Add recipe" vanished while typing a category).
- Respect bottom safe-area insets; nothing sits under the phone nav bar.

## Color and theme
- **Never hard-code colors.** Everything uses theme tokens from `src/lib/theme.ts`. Accent-tinted UI (icons, center + button, menu icons) uses the user's selected accent. (1.0.8: a hard-coded orange secondary color leaked into 5 places.)
- Content on an accent fill uses the per-accent on-color: dark on Amber and Lime, white on the rest.
- Status colors (badges, destructive actions) are fixed, not accent-driven, so they never blend in.
- Check every accent in both light and dark mode for ~3:1 contrast on icons/borders before shipping.

## v1.0.9 (2026-10-04)

- **One accent shade, aliased.** Light and dark used different hexes, and a second orange token leaked into the + button, More, the add menu, the filter dot, and the navigation theme. `accent` is now an alias of `primary`. Badges stay a fixed red with a white ring so they still show on the Red accent.
- **A custom tab button must apply `style`.** v1.0.8 set the center slot to the + width on `tabBarItemStyle`. That style is on the outer item; the inner button only gets it if `tabBarButton` uses the `style` prop. Measure the rendered slot before assuming the width took effect.
- **Do not write `flex: 0` to size a tab slot.** On web that shorthand is flex-basis 0% and the item collapses to 0px even with `width: 58`. The + circle then overlaps Shopping. Set `flexGrow: 0`, `flexShrink: 0`, and `flexBasis` to the width. Measured on the 1.0.9 web render: the old style left the center item at 0px and the circle’s center at x=208 on a 360px bar (screen center 180).
- **Classic artwork has to fill the safe circle.** The yellow bowl was drawn smaller than the other launcher icons. Scale the adaptive foreground and the legacy icon up with the others, and check a side-by-side render.
- **Hooks stay above any early return.** `RecipeList` called `useRef` after `if (!recipes) return`. The hook count changed once recipes loaded and every screen that mounts the list crashed with “Rendered more hooks than during the previous render.”
- **Check contrast on the real page background, not only pure white.** The light background is `#F5F7F5`. A shade that clears 3.11:1 on `#FFFFFF` can fall under 3:1 there. Amber and Lime were darkened a step (`#C1810A`, `#58A018`) so they still clear 3:1 on that surface.
- **A flex row of a text field plus buttons clips at 360dp unless the field can shrink.** Set `flexGrow: 1`, `flexShrink: 1`, and `minWidth: 0` on the input, and leave Add and Cancel at their natural width (`flexShrink: 0`). `minWidth: auto` on a web input keeps the placeholder width and pushes Cancel off the card.
- **The raised + clearance is the measured rise, plus a margin.** `marginTop: -29` is not the whole overlap. On the rendered bar the circle top sits 36dp above the bar, and 32dp of padding left Add recipe under it. `TAB_PLUS_CLEARANCE` is that rise plus 16dp, on every tab's scroll padding. Scrolling a focused field to the center parks the next control on the +.
- **Specs to keep (1.0.9).** Each accent is one shade used in light and dark mode, at about 3:1 on white (`#FFFFFF`) and on the dark card (`#1D211D`). Badges stay `#E53935` with white text and a white ring in every theme. The + tab slot is pinned with `flexBasis: 58` (`flexGrow: 0`, `flexShrink: 0`), and the + circle is 52dp.

## v1.1.0 (2026-10-13)

- **`ALTER PUBLICATION ... DROP TABLE` has no `IF EXISTS` here.** The first apply failed at that clause (`syntax error at or near "exists"`) and rolled back, so the migration file was still unapplied and could be corrected. Guard with `pg_publication_tables`, then `DROP TABLE`.

- **Check every caller before uninstalling a package.** Grocery run still calls `useKeepAwake`. Removing cooking mode only removed the keep-awake setting. `expo-keep-awake` stays.
- **A removed collection still has to parse.** Old backups include `barcode_items` and `cookingModeKeepAwake`. The zod schema still accepts `barcode_items` (new files write `[]` and do not restore them). Settings merge copies only keys that exist on `DEFAULT_SETTINGS`.
- **Servings scaling is display-only.** The stepper does not write the recipe. Fractions and mixed numbers go through `parseIngredient` / `scaleIngredient`. A line that does not parse stays as written.
- **Fetch `origin/main` before branching.** This VM’s checkout was behind the sweetener-rule removal. Branching from the stale snapshot would have put that rule back.

## v1.1.2 (2026-10-14)

- **Purple keeps the white on-color.** `#9D5DEE` is about 4.01:1 for white on the fill, 4.01:1 against white, 4.07:1 against the dark card, and 3.73:1 against the light page `#F5F7F5`. That clears the 3:1 bar. Do not switch Purple to the dark on-color.
- **The default accent is also the fallback.** A saved accent id stays. A missing or unknown id uses `DEFAULT_ACCENT`. Changing the default changes that fallback. A test of the live fill color has to read `DEFAULT_ACCENT`, not a hardcoded Green.
- **Hand the APK over the existing file-system content URI.** `File.contentUri` is `${applicationId}.FileSystemFileProvider`. Do not add a second FileProvider. `REQUEST_INSTALL_PACKAGES` does not show a runtime dialog. The prompt is the system "install unknown apps" screen for this package.
- **Web still draws the updater.** Update returns before any native import. A `__DEV__` `updatePreview` query draws a state for screenshots. A release build ignores it. Nothing checks on launch.

## v1.1.1 (2026-10-14)

- **The idle “All changes saved” line is the recipe screen, not the import write.** Hiding that line must leave rating, cooked, category, and unit saves immediate. A link import is a separate draft: dry-run preview, pinned Save, and a leave warning. A duplicate notice is not an unsaved draft.
- **A fold drops state that lives in the secondary pane.** `TwoPaneLayout` unmounts that pane below 600dp. The unsaved meal has to live outside the pane (a module both the tab and the day route read) or opening the day on a phone loses the card.
- **Do not write a ref during render.** `commitRef.current = commit` fails `react-hooks/refs`. Close over the callback in the effect that uses it.
- **`findBy*` inside `act()` does not retry.** Wait for the control, then press it in `act`.

## 2026-10-13

- **No house sweetener restriction.** Jason dropped it. Do not reject a recipe, an import, or an edit based on which sweetener it uses, and do not put a preferred sweetener back into validation, import errors, placeholders, or docs. Diabetic-friendly still means track servings.
- **Leave the shipped sample fingerprint alone.** `src/storage/legacy-samples.ts` matches untouched v1.0.0 copies by title, ingredient lines, steps, tags, and servings. Rewriting that fingerprint so a wording search comes up empty stops the cleanup from recognizing those copies.

## Process
- **Cloud agents: put Node on `/usr/local/bin`.** (2026-10-04) Login shells skip `~/.bashrc`, so nvm is invisible after install. Expo web binds IPv6 `localhost` (`::1`); `127.0.0.1:8081` does not connect. Open `http://localhost:8081`.
- Put reviewer (Spec/Pixel) checks into the build prompt up front so one cloud-agent run is enough; avoid fix-up runs.
- Batch changes into fewer versions; every build + review costs usage.
- Releases: one tag push builds and publishes. Docs-only commits use `[skip ci]`.

## General lessons (from Eve's shared app-build-lessons skill; Eve keeps this section in sync)

### Verification
- Verify UI from real renders or screenshots at 360dp and a default width, never from layout math. Reviewers sign off only from screenshots.
- Include reviewer checklists in the build prompt up front so one run is enough.
- Open every screenshot before signing off; a file can exist and still be an error overlay.
- Web renders don't prove text fits on a phone: keep allowFontScaling={false} on tab labels, or capture on Android at font scale above 1.
### Layout
- Text never truncates: shrink-to-fit and less padding before shorter labels.
- Every text input needs keyboard avoidance, tested with the keyboard open (Android softwareKeyboardLayoutMode resize).
- Editing one field must not hide nearby controls.
- Respect safe-area insets on all edges.
- A raised center FAB needs bottom scroll padding on every tab so the last control never sits under it.
- In a row with a text input plus buttons, the input flex-shrinks with minWidth: 0 and buttons keep natural width.
### Platform APIs
- Guard platform-specific React Native APIs with typeof before calling them, because the web build produces screenshots.
### Theme and color
- Never hard-code colors; use theme tokens; accent UI follows the chosen accent.
- Content on an accent fill uses a per-accent on-color.
- Status colors are fixed, not accent-driven.
- One shade per color meeting about 3:1 contrast on light and dark.
### Process and usage
- Before deleting a dependency, search every import. One package can serve a feature you are keeping.
- A cloud VM snapshot can be behind the remote default branch. Fetch that branch before you branch.
- Unsaved UI that must survive a layout change cannot live in a pane that unmounts below a width breakpoint. Keep it in the parent or a store both widths read.
- Do not assign `ref.current` during render. React's refs lint rejects it. Update the ref in an effect, or close over the latest callback in the effect dependencies.
- Do not wrap `findBy*` inside `act()`. The query does not retry there. Wait for the control, then press it inside `act`.
- A saved setting's default is also the fallback for a missing or unknown stored value. Changing the default changes that fallback. A value the user already saved stays.
- Android "install unknown apps" is an app-op. Listing `REQUEST_INSTALL_PACKAGES` in the manifest does not show a permission dialog. Open the system settings screen for this package.
- Do not import a native module until the platform check has passed. The web build is what the screenshots are taken from.
- A Google Docs markdown export escapes punctuation (`\+`, `\_`, `\#`) and wraps sentences in backticks. Unescape so it renders. Do not rewrite the author's sentences.
- Batch requests into fewer, larger versions.
- One release event builds once (concurrency group; skip CI on docs-only commits).
- Verify the release yourself: run succeeded, asset attached, version correct, same signing cert.
- Build workflow: plan, work, code review, compound (record lessons). Run checks and show evidence before saying done; write a failing test first for bug fixes.
- Read LESSONS.md before every build; before opening/updating a PR, add new lessons and list them under 'Lessons learned' in the PR description.
