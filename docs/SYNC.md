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

- Migrations in `supabase/migrations/` are history; never edit an applied one. The last one,
  `20261006000000_remove_household_sharing.sql`, moved every household-scoped row to its author's personal scope
  (`owner_id` = `created_by`, else the household's creator/owner; `household_id` = NULL), made the sync trigger and RLS
  personal-only, and made `create_household` / `join_household` refuse. Nobody lost data.
- The `households` and `household_members` tables (and the unused `receipt_aliases`) are **left in place for now**;
  dropping them is a later cleanup.
- The live `mcp` Edge Function was deleted in v1.0.6, so the MCP endpoint no longer exists.
- `.github/workflows/supabase-migrations.yml` still applies new migrations on `main`.

Records on the phone keep their `createdBy` / legacy `householdId` fields (harmless; Backup & restore strips them).
