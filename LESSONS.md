# LESSONS.md: My Recipe App

Read this before every build. Add a dated lesson after each version: what went wrong, the rule that prevents it.
General lessons that apply to any app also live in Eve's shared "app-build-lessons" skill.

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
