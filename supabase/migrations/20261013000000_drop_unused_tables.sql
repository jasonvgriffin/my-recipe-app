-- My Recipe App v1.1.0: drop tables nothing reads anymore (docs/SYNC.md).
-- Household sharing was removed in v1.0.6 and receipt scanning in v1.0.1.
-- Those migrations left households, household_members, and receipt_aliases in place.
-- This file is new. Do not edit an applied migration.
--
-- recipes, categories, pantry_items, meal_plan_entries, shopping_items, and barcode_items
-- still have a nullable household_id that references households. Drop those foreign keys
-- first. The rows stay. household_id columns stay so this migration does not rewrite data.

alter publication supabase_realtime drop table if exists public.receipt_aliases;

alter table if exists public.recipes drop constraint if exists recipes_household_id_fkey;
alter table if exists public.categories drop constraint if exists categories_household_id_fkey;
alter table if exists public.pantry_items drop constraint if exists pantry_items_household_id_fkey;
alter table if exists public.meal_plan_entries drop constraint if exists meal_plan_entries_household_id_fkey;
alter table if exists public.shopping_items drop constraint if exists shopping_items_household_id_fkey;
alter table if exists public.barcode_items drop constraint if exists barcode_items_household_id_fkey;

drop table if exists public.receipt_aliases;
drop table if exists public.household_members;
drop table if exists public.households;

drop function if exists public.create_household(text);
drop function if exists public.join_household(text);
drop function if exists public.rotate_invite_code(uuid);
drop function if exists public.is_household_member(uuid);
drop function if exists public.is_household_owner(uuid);
drop function if exists public._legacy_household_sync_check();

drop type if exists public.household_role;
