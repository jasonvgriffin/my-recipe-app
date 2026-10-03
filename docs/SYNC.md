# Household sharing & sync (spec #25) — Supabase

**Status:** in v1.0.0. Backend = a free Supabase project created by Eve (agents must NOT sign up for or create
services). Project ref `krqmumdgsfimasjawxqn` (us-east-1). Until a user opts in from Settings (or when the URL/anon key
are absent, e.g. local dev without `.env.local`), the app runs fully offline/solo.

## Goals

- Multiple people in one **household** contribute recipes; shared **pantry, meal plan and shopping list**.
- **Offline-first**: the on-device store is always the source of truth for the UI; sync runs in the background.
- Works **fully offline/solo when signed out** (no account required).

## Architecture

```
UI screens ──> stores (src/storage/*: recipeStore, mealPlanStore, pantryStore)
                  │  Collection<T> repository (src/storage/kv.ts): save / remove (tombstone) /
                  │  changesSince / applyRemote (LWW) / purgeTombstones
                  ▼
           sync engine (src/sync/engine.ts) ──RemoteAdapter──> Supabase (src/sync/supabase.ts, PostgREST + RLS)
```

- **Repository interface:** `Collection<T>` — swapping AsyncStorage for SQLite or adding a backend needs no UI changes.
- **Records:** every synced type extends `SyncMeta` (`src/types/sync.ts`): UUID v4 `id`, `householdId?`,
  `createdBy?` (auth user id), `createdAt`, `updatedAt`, `deletedAt?` (tombstone).
- **Identity:** `src/storage/identity.ts` holds `{ userId, householdId }`; new local writes are stamped with it.
- **Synced tables:** `recipes`, `categories`, `pantry_items`, `meal_plan_entries`, `shopping_items` (each
  shopping item is its own row so two people can check items concurrently), `barcode_items`. (`receipt_aliases` exists in the database from an applied migration but is no longer synced: receipt scanning was removed in v1.0.1.)
  Settings and the cook-with-me session stay per device.

## Sync algorithm (`createSyncEngine(...).syncOnce()`)

Per table:

1. **Adopt** local-only records (no `householdId`, e.g. created while signed out) → stamp household + author.
2. **Push** local changes (incl. tombstones) since the push cursor → `upsert` on `id`.
3. **Pull** remote rows with `updated_at` > pull cursor → `applyRemote`, **last-write-wins by `updatedAt`**.
4. **Purge** local tombstones older than 30 days.
   Cursors are persisted per household. Run on: sign-in/household join, app foreground, debounced after local
   writes, pull-to-refresh (Household screen), and (optional) on Supabase **realtime** change events for the household.
   A failed push or pull leaves the cursors unmoved — that on-device backlog is the offline queue — and the
   coordinator retries with backoff while the status indicator says offline. Other failures show the error
   with Sync now. Signed out, or with the feature gated off, nothing is uploaded and the UI stays solo.

`updatedAt` is the client write time (needed for offline edits). The server also enforces LWW (a stale
update keeps the newer row), keeps `created_by`/`household_id` immutable, and stamps `server_updated_at`.
Clock skew between phones can make an older edit win; acceptable for a family recipe app (documented trade-off).

## Database (`supabase/migrations/20261003000000_households_and_sync.sql`)

- `households (id, name, invite_code, created_by, …)`
- `household_members (household_id, user_id, role 'owner'|'member', display_name, joined_at)`
- RPCs: `create_household(p_name) → (id, invite_code)`, `join_household(p_code) → household_id`,
  `rotate_invite_code(p_household)` (owner only)
- Synced tables: `id uuid pk, household_id, created_by, created_at, updated_at, deleted_at, server_updated_at,
data jsonb` + query columns (`recipes.title`, `meal_plan_entries.date/recipe_id`, `shopping_items.week_start/checked`, …).
  The full app record lives in `data` (mapping: `src/sync/rows.ts`), so most app-schema changes need no DB migration.
- **RLS everywhere:** members can select/insert/update only rows of households they belong to; no client hard
  deletes (tombstones only); membership changes only via the RPCs; owners can remove members, members can leave.
- Realtime publication added for the synced tables (optional use).
- The migration was smoke-tested in PGlite (Postgres WASM) with stubbed `auth` schema: household create/join,
  cross-household isolation, stale-write rejection, author immutability, delete blocking.

## Auth

Supabase **email OTP / magic link** (`sendEmailOtp`, `verifyEmailOtp` in `src/sync/supabase.ts`). Prefer the
6-digit code flow in-app (no deep-link setup needed); magic link redirect `myrecipeapp://auth` optional.
Session persisted in AsyncStorage. Household flow: create household (shows invite code) or enter a code to join.

## Configuration

- `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (see `.env.example`; local `.env.local` is gitignored).
  CI passes repo variable `EXPO_PUBLIC_SUPABASE_URL` and secret `EXPO_PUBLIC_SUPABASE_ANON_KEY` to the build.
- `getSupabaseConfig()` returns undefined unless both are set (https) → app stays offline/solo.
- **Never commit or ship the `service_role` key or the DB password.** The URL + anon key are public-safe but are
  kept in GitHub config (not committed) so they can be rotated without a code change.
- GitHub config on `jasonvgriffin/my-recipe-app`: variables `EXPO_PUBLIC_SUPABASE_URL`, `SUPABASE_PROJECT_REF`,
  `SUPABASE_REGION`; secrets `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_DB_PASSWORD`.

## Applying migrations

- Add a new file `supabase/migrations/<UTC timestamp>_<name>.sql`; never edit an applied migration.
- `.github/workflows/supabase-migrations.yml` runs `supabase db push` against the session pooler on every push to
  `main` that touches `supabase/migrations/**` (or manually, with an optional dry run). Applied versions are
  tracked in `supabase_migrations.schema_migrations`, so only new files run.
- Cloud-agent boxes may not have outbound Postgres (5432/6543) access; use the workflow rather than local psql.
- Smoke-test new SQL locally first in PGlite (Postgres WASM) with a stubbed `auth` schema.
- Auth: email OTP/magic link is Supabase's default provider (enabled). Free-tier built-in SMTP is rate limited
  (a few emails/hour); custom SMTP is a later decision for Jason.

## Account UI (Settings → Household)

Opt-in. The recipes tab never asks anyone to sign in. `householdSync` gates the Settings row, the
`/household` route, sync, and the "Shared by" line (`FeatureGate` / `canUse`). With the feature locked or
Supabase env vars absent, the screen explains that recipes still work on this device.

- **Sign in:** email, then the 6-digit code (`verifyEmailOtp`). Magic link to `myrecipeapp://auth` is optional;
  other app deep links are ignored. Since v1.0.1 the `src/app/auth.tsx` route handles that redirect (no more
  "Unmatched Route"): it reads the raw URL (tokens in the `#fragment` or `?code=`), completes sign-in through
  `completeMagicLink` in `src/household/runtime.ts` (one exchange per URL, shared with the app-wide URL listener),
  then opens Settings → Household with a success or error message.
- **Household:** create (shows the invite code), join with a code, or pick one if you already belong to several.
- **Invite code:** shown to members; Copy, Share, and (owner only) rotate.
- **Members:** list with Owner / Member. Owners can remove someone else. Anyone can leave. Display name is what
  recipe detail shows as "Shared by <name>" (blank when the author never set a name — no raw user ids).
- **Sign out / leave** keep every recipe already on the device. New edits stay local until you join again.

## Sync triggers

`src/household/runtime.ts` owns the app singleton (tests replace it with a fake backend — they never call Supabase):

| Trigger | When |
| --- | --- |
| Sign-in / join / restore | Household id becomes active |
| App foreground | `AppState` → `active` |
| Local write | Debounced (~1.5s) after `Collection.save` / `remove` |
| Pull-to-refresh / Sync now | Household screen |
| Realtime | Optional Supabase channel; a burst is debounced. If it fails, the other triggers still run |
| Offline retry | After a network error, backoff up to 30s while the queue is dirty |

Status phases: solo, pending, syncing, synced, offline, error (`syncStatusLabel`). Last-write-wins is unchanged
(`updatedAt`, including tombstones). Every synced table — recipes, categories, pantry, meal plan, shopping items,
and barcode product names (`barcode_items`) — round-trips `household_id` + `created_by`.

## What exists

- ✅ Data model (SyncMeta on all synced records, UUIDs, tombstones), repository interface, identity stamping,
  LWW sync engine + tests with a fake remote, row mapping, Supabase adapter + auth/household helpers,
  SQL migrations with RLS, env config, CI migration workflow, project configured in GitHub.
- ✅ Settings → Household (email code, magic link, create/join/leave, invite code, members, sign out),
  background sync triggers, offline queue, status indicator, optional realtime, "Shared by" attribution.
