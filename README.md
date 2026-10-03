# My Recipe App

AI-friendly, diabetic-friendly recipe app (React Native + Expo SDK 57, TypeScript, expo-router).
Android first; iOS later from the same codebase.

Full v1 feature spec: [docs/SPEC.md](docs/SPEC.md).

## Features today

- Recipes first: opens to Recipes, no sign-in; Settings can hide the optional Meal plan / Shopping tabs
- Dark theme; bottom tabs (side rail on unfolded foldables/tablets), list + detail side-by-side on wide screens
- Recipe list with keyword search and filters (cooked / cooked recently / not cooked)
- Cooked toggle with last-cooked date; "Plan for today"; tappable source link; notes
- Recipes tab with five buttons: Search, Existing Recipes, Share Recipes, Add Recipe, What can I make with my existing pantry?
- Meal plan month view; shopping list compiled from a week's plan with check-off and barcode scan
- Add recipe: title, ingredients, steps, tags, servings
- Recipe detail (servings, ingredients, steps) and delete
- Cook-with-me step session (`myrecipeapp://cook/...` deep links) for voice assistants
- Stored on-device (AsyncStorage), household-sync-ready (Supabase backend; sign-in UI pending)
- Barcode scanning for the pantry and the shopping list (Open Food Facts name/brand lookup)
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

Every push/PR builds an APK in GitHub Actions and attaches it to the run as the `my-recipe-app-apk`
artifact (private repo: sign in to GitHub to download). Published releases happen only from a `v*` tag;
**the first published APK will be v1.0.0, once all 27 SPEC features are complete.**

See [AGENTS.md](AGENTS.md) for contributor/agent rules and [docs/PLAN.md](docs/PLAN.md) for the roadmap.
