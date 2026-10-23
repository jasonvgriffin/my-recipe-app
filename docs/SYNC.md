# Sync — removed in v1.0.6

Household sharing (SPEC #25) was **removed in v1.0.6 at Jason's request**, and the remote MCP server (SPEC #28),
the only other reason to sign in, was **deliberately cut in 1.0.6 at Jason's request; it may be revisited in a future
version**. The app is now local-first: no account, no sign-in, no cloud sync. Use Settings → Backup & restore
(docs/BACKUP.md) to move data to a new phone.

What was removed from the app: `src/sync/` (engine, coordinator, Supabase adapter, account/email-code sign-in),
the account runtime, Settings → Household / More → Household, the `/household`, `/account` and `/auth` routes, the
`householdSync`, `cloudSync` and `mcpAccess` feature gates, `src/mcp/`, `supabase/functions/mcp/` and
`site/oauth/consent.html`. All of it is in git history.

## Supabase project state

- Migrations in `supabase/migrations/` are history; never edit an applied one.
  `20261006000000_remove_household_sharing.sql` moved every household-scoped row to its author's personal scope
  (`owner_id` = `created_by`, else the household's creator/owner; `household_id` = NULL), made the sync trigger and RLS
  personal-only, and made `create_household` / `join_household` refuse. Nobody lost data.
- **v1.1.0** adds `20261013000000_drop_unused_tables.sql`. It drops `households`, `household_members`, and
  `receipt_aliases`, plus the household helper functions and the `household_role` type. Foreign keys from
  `recipes`, `categories`, `pantry_items`, `meal_plan_entries`, `shopping_items`, and `barcode_items` to
  `households` are dropped first. Those tables and their `household_id` columns stay. `barcode_items` is not dropped.
- The app no longer depends on `@supabase/supabase-js`. There is no Supabase client and `.env.example` has no
  Supabase variables. Phone records still use `SyncMeta` in `src/types/record.ts` (UUID, timestamps, optional
  legacy `householdId` / `createdBy`).
- The live `mcp` Edge Function was deleted in v1.0.6, so the MCP endpoint no longer exists.
- The `supabase-migrations.yml` workflow was removed; `supabase/migrations/` is kept as history only.

Backup & restore strips `householdId` and `createdBy` on export. An old backup still loads.
