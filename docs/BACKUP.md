# Backup & restore (v1.0.6)

Settings → **Backup & restore** (`src/app/backup.tsx`). Moves everything to a new phone, or keeps a copy.
Offline, no account, no storage permission.

## What's in the file

One JSON file, `My-Recipe-App-backup-YYYY-MM-DD.myrecipe` (`application/json`), built by `createBackup`
(`src/backup/backup.ts`):

| Field | Contents |
|-------|----------|
| `format` | `"my-recipe-app-backup"` |
| `version` | Schema version (`BACKUP_VERSION`, 1). Newer files are refused with "update the app"; older ones are upgraded in `parseBackup` |
| `exportedAt`, `appVersion` | When and from which app version |
| `data.recipes` | Every recipe: ingredients, steps, notes, tags, ratings, categories, servings, units, cooked flag + cooked history, source link, photo link |
| `data.categories`, `data.meal_plan_entries`, `data.shopping_items`, `data.pantry_items`, `data.barcode_items` | The other collections |
| `settings` | Units, optional-feature toggles, cooking keep-awake, appearance (theme + accent) |
| `photos` | Each recipe's local photo, base64, by recipe id (web photos stay URLs) |

Not included: deleted records (tombstones), account/household stamps (`householdId`, `createdBy`: the new
phone's account adopts the data on its next sync), sync cursors, the sign-in session, and the live cook-with-me
session (step timers are not stored; they belong to a cooking session on the device).

## Export

- **Share backup file…**: the Android share sheet (Drive, Gmail, Files, Nearby Share…), via the app's
  RecipeShare FileProvider (cache folder).
- **Save to a folder…**: the system folder picker (Storage Access Framework) and `Directory.createFile`.

## Import

**Choose backup file…** opens the system file picker (SAF), then `parseBackup` validates it (zod schema, size cap,
format and version checks) and shows a preview (counts of recipes, photos, categories, plan, list, pantry,
settings). Then:

- **Merge into this phone**: adds what's missing; for the same record the newer copy (`updatedAt`) wins; a
  category with the same name (e.g. the default Breakfast / Lunch / Dinner) is reused and recipes are remapped.
- **Replace this phone's data** (asks first): records not in the backup are deleted (tombstoned, so a signed-in
  account syncs the removal), then everything from the backup is written.

Writes go through the normal stores, so restored data is stamped with the current account and syncs if you are
signed in. Photos are written to the app's photo folder first and recipes point at the new files.

Not gated by an entitlement: it is data safety for the core recipe box (Rule #1), not an optional feature.
Tests: `__tests__/backup.test.ts`, `__tests__/backup-ui.test.tsx`.
