# LESSONS.md: My Recipe App

Read this before every build. Add a dated lesson after each version: what went wrong, the rule that prevents it.
General lessons that apply to any app are copied into the last section of this file from Eve's shared skill, which cloud agents can't read directly. When you find a lesson that applies to any app, add it under General lessons and mention it in your PR so Eve can sync it to the shared skill.

## Working with Eve

Jason asked the coding agent to get better with Eve as we go. The loop is:

- Read this file before writing code. Follow every rule in it.
- When a review or a bug shows a rule that would have prevented it, add that lesson here in the same change. One rule, what went wrong, the version.
- Recipe-app rules stay in this file (layout, theme, allulose only, no nutrition, recipes first).
- A rule that would apply to any of Jason's apps goes to Eve at `eve.chief_of_staff@agentmail.to` so she can add it to app-build-lessons. Do not copy that skill into this repo.
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

## Process
- **Cloud agents: put Node on `/usr/local/bin`.** (2026-10-04) Login shells skip `~/.bashrc`, so nvm is invisible after install. Expo web binds IPv6 `localhost` (`::1`); `127.0.0.1:8081` does not connect. Open `http://localhost:8081`.
- Put reviewer (Spec/Pixel) checks into the build prompt up front so one cloud-agent run is enough; avoid fix-up runs.
- Batch changes into fewer versions; every build + review costs usage.
- Releases: one tag push builds and publishes. Docs-only commits use `[skip ci]`.

## General lessons (from Eve's shared app-build-lessons skill; Eve keeps this section in sync)

### Build workflow
- **Build workflow (Compound Engineering plugin, installed Oct 2026):** run each build as plan, then work, then code review, then compound. Use `ce-plan` to turn the change list into a plan with a yes/no done checklist, `ce-work` for the coding agent, `ce-code-review` on the PR before merge, and `ce-compound` after release to record learnings. If cloud agents can't see the plugin, write these steps into the repo's `AGENTS.md`. Source: https://github.com/EveryInc/compound-engineering-plugin
- Two standing rules (originally from the Superpowers plugin, uninstalled Oct 4 2026; follow them anyway): `verification-before-completion` (run the checks and show the evidence before saying anything is done or fixed) and `test-driven-development` for bug fixes (write a failing test for the bug first, then fix it). Compound Engineering is the only build workflow plugin.


### Verification
- Verify UI from real renders or screenshots at a small width (360dp) and a default width, never from layout math. Reviewers sign off only from screenshots. (Recipe app 1.0.8: labels passed the math but were truncated on the phone.)
- Include reviewer checklists in the build prompt up front, so one agent run is enough and no fix-up run is needed.

### Layout
- Text never truncates: shrink-to-fit plus removing padding come before shortening labels.
- Every text input needs keyboard avoidance, tested with the keyboard open (Android: softwareKeyboardLayoutMode resize).
- Editing one field must not hide nearby controls.
- Respect safe-area insets on all edges.

### Theme and color
- Never hard-code colors. Use theme tokens, and accent-tinted UI follows the user's chosen accent.
- Content on an accent fill uses a per-accent on-color (dark text on light accents such as amber or lime).
- Status colors (badges, destructive actions) are fixed, not accent-driven.
- If light and dark modes should match, use one shade per color that meets about 3:1 contrast on both backgrounds.

### Process and usage
- Batch requests into fewer, larger versions. Each build plus review costs real usage.
- Group chats wake every member on every message. Keep specialist bots out of busy rooms and message them directly at checkpoints.
- Make sure one release event builds once (concurrency group, skip CI on docs-only commits).
- Verify the release yourself: the run succeeded, the asset is attached, the version is correct and it's signed with the same cert.
