# Backup & restore (v1.0.6; .zip + Save as since v1.0.7)

Settings → **Backup & restore** (`src/app/backup.tsx`). Moves everything to a new phone, or keeps a copy.
Offline, no account, no storage permission.

## What's in the file

A standard ZIP, `My-Recipe-App-backup-YYYY-MM-DD.zip` (`application/zip`, v1.0.7), holding one JSON document
`backup.json` built by `createBackup` (`src/backup/backup.ts`). v1.0.6 wrote the same JSON as a bare `.myrecipe`
file, which Google Drive refused to save from the share sheet; those files still import.

| Field | Contents |
|-------|----------|
| `format` | `"my-recipe-app-backup"` |
| `version` | Schema version (`BACKUP_VERSION`, 1). Newer files are refused with "update the app"; older ones are upgraded in `parseBackup` |
| `exportedAt`, `appVersion` | When and from which app version |
| `data.recipes` | Every recipe: ingredients, steps, notes, tags, ratings, categories, servings, units, cooked flag + cooked history, source link, photo link |
| `data.categories`, `data.meal_plan_entries`, `data.shopping_items`, `data.pantry_items`, `data.barcode_items` | The other collections |
| `settings` | Units, optional-feature toggles, cooking keep-awake, appearance (theme + accent) |
| `photos` | Each recipe's local photo, base64, by recipe id (web photos stay URLs) |

Not included: deleted records (tombstones), legacy author stamps (`householdId`, `createdBy`), and the live cook-with-me
session (step timers are not stored; they belong to a cooking session on the device).

## Export

- **Share backup file…**: the Android share sheet (Drive, Gmail, Files, Nearby Share…), via the app's
  RecipeShare FileProvider (cache folder).
- **Save backup as…** (v1.0.7): one system “save as” dialog (SAF `ACTION_CREATE_DOCUMENT`, `saveDocumentAsync` in the
  RecipeShare module) — pick Google Drive, Downloads or any folder and the name. Replaces v1.0.6's folder picker,
  which showed “Can't use this folder” on Drive's root.

## Import

**Choose backup file…** opens the system file picker (SAF; accepts the .zip and old .myrecipe files), then
`parseBackupFile` unzips if needed and `parseBackup` validates it (zod schema, size cap,
format and version checks) and shows a preview (counts of recipes, photos, categories, plan, list, pantry,
settings). Then:

- **Merge into this phone**: adds what's missing; for the same record the newer copy (`updatedAt`) wins; a
  category with the same name (e.g. the default Breakfast / Lunch / Dinner) is reused and recipes are remapped.
- **Replace this phone's data** (asks first): records not in the backup are deleted (tombstoned), then everything from the backup is written.

Writes go through the normal stores. Photos are written to the app's photo folder first and recipes point at the new files.

Not gated by an entitlement: it is data safety for the core recipe box (Rule #1), not an optional feature.
Tests: `__tests__/backup.test.ts`, `__tests__/backup-ui.test.tsx`.
