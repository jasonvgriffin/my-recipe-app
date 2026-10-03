# My Recipe App

AI-friendly, diabetic-friendly recipe app (React Native + Expo SDK 57, TypeScript, expo-router).
Android first; iOS later from the same codebase.

## Features (Phase 1)

- Recipe list with search by title, tag, or ingredient
- Add recipe: title, ingredients, steps, tags, servings, net carbs per serving
- Recipe detail (servings, carbs/serving, total carbs, low-carb badge) and delete
- Stored on-device (AsyncStorage); two low-carb seed recipes on first launch
- Validation enforces the house rule: **allulose is the only sugar-free sweetener (no monk fruit)**

## Develop

```bash
npm ci
npx expo start        # open in Expo Go / emulator / web
npm test
npm run lint
npm run typecheck
```

## Android APK

Every push to `main` builds an APK in GitHub Actions and publishes it to the rolling
[`latest-apk`](https://github.com/jasonvgriffin/my-recipe-app/releases/tag/latest-apk) prerelease:

https://github.com/jasonvgriffin/my-recipe-app/releases/download/latest-apk/my-recipe-app.apk

The repo is private, so you must be signed in to GitHub to download it. The APK is signed with the
debug keystore (fine for sideloading; enable "install unknown apps" on the phone).

See [AGENTS.md](AGENTS.md) for contributor/agent rules and [docs/PLAN.md](docs/PLAN.md) for the roadmap.
