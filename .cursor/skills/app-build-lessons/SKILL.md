---
name: app-build-lessons
description: >-
  Use before starting any app build or new app project with coding agents, and
  after every release to record what was learned.
---
# App build lessons

A living list of general lessons from building apps with cloud coding agents. It gets better over time.

## How to use
1. **Before a build:** paste the relevant lessons below into the coding agent's prompt, or make sure the repo has a `LESSONS.md` that `AGENTS.md` requires reading. For a brand-new project, create `LESSONS.md` from the General lessons section before the first agent runs. Every coding-agent prompt (and every repo's `AGENTS.md`) must require the write step: before opening or updating a PR, add anything new learned in the run to `LESSONS.md` even if nobody asked (app-specific under the app section, reusable under General lessons) and list them under a `Lessons learned` heading in the PR description.
2. **After every release:** ask what went wrong or needed a fix-up run. Add each new lesson in two places, as a one-line rule plus a short why with version and date: app-specific ones go in that repo's `LESSONS.md`, and general ones go here. After each merge, harvest the PR's `Lessons learned` section: copy the general ones here and into the other repos' `LESSONS.md`.
3. **Build workflow (Compound Engineering plugin, installed Oct 2026):** run each build as plan, then work, then code review, then compound. Use `ce-plan` to turn the change list into a plan with a yes/no done checklist, `ce-work` for the coding agent, `ce-code-review` on the PR before merge, and `ce-compound` after release to record learnings. If cloud agents can't see the plugin, write these steps into the repo's `AGENTS.md`. Source: https://github.com/EveryInc/compound-engineering-plugin
   Two standing rules (originally from the Superpowers plugin, uninstalled Oct 4 2026; follow them anyway): `verification-before-completion` (run the checks and show the evidence before saying anything is done or fixed) and `test-driven-development` for bug fixes (write a failing test for the bug first, then fix it). Compound Engineering is the only build workflow plugin.
   Cloud agents can't read this skill, so every repo's `LESSONS.md` carries a copy under "General lessons". Whenever this section changes, re-sync that copy into my-recipe-app, study-buddy and proxima with a `[skip ci]` commit, and pull any general lessons agents added there back into this skill.
4. Keep lessons short and concrete, merge duplicates, and remove ones that no longer apply.

## General lessons

### Verification
- Verify UI from real renders or screenshots at a small width (360dp) and a default width, never from layout math. Reviewers sign off only from screenshots. (Recipe app 1.0.8: labels passed the math but were truncated on the phone.)
- Include reviewer checklists in the build prompt up front, so one agent run is enough and no fix-up run is needed.
- Open every screenshot before signing off. A file can exist and still be an error overlay. (Recipe app 1.0.9: the keyboard and add-menu shots were a red error overlay and were attached anyway.)
- Web renders don't prove text fits on a phone. Keep `allowFontScaling={false}` on tab labels, or capture on Android at a font scale above 1. (Recipe app 1.0.9: shrink-to-fit at the default web font size still truncates when the phone scales the font.)

### Layout
- Text never truncates: shrink-to-fit plus removing padding come before shortening labels.
- Every text input needs keyboard avoidance, tested with the keyboard open (Android: softwareKeyboardLayoutMode resize).
- Editing one field must not hide nearby controls.
- Respect safe-area insets on all edges.
- A raised center FAB needs bottom scroll padding on every tab (the measured rise plus a margin) so the last control never sits under it. (Recipe app 1.0.9: 32dp of padding left Add recipe under the +.)
- In a row with a text input plus buttons, the input flex-shrinks with `minWidth: 0` and the buttons keep their natural width, so nothing is clipped at 360dp. (Recipe app 1.0.9: Cancel was pushed off the card.)

### Platform APIs
- Guard platform-specific React Native APIs (for example `TextInput.State`) with `typeof` before calling them, because the web build produces the screenshots. (Recipe app 1.0.9: `currentlyFocusedInput` is missing on web and threw on every focus.)

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
- Check tool availability before delegating. Background helpers can't launch cloud agents, so the orchestrator launches them. (Recipe app 1.0.9.)
