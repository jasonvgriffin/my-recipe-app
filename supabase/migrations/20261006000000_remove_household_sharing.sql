-- My Recipe App v1.0.6: household sharing removed at Jason's request (docs/SYNC.md, docs/SPEC.md).
--
-- Every synced row is now personal: household_id IS NULL and owner_id = the user (RLS: only they can read/write it).
--   1. Existing household rows move to their author's personal space (created_by; if unknown, the household's
--      creator, then its owner), with updated_at bumped so devices pull them. Nobody loses data.
--   2. The sync trigger forces new/updated rows into the personal space, so an older app build that still sends
--      a household_id simply writes to the caller's personal space instead of failing.
--   3. RLS only allows personal rows. create_household / join_household now refuse.
-- The households / household_members tables (and receipt_aliases, unused since v1.0.1) are left in place for now;
-- nothing reads them any more. Dropping them is a later cleanup.

-- receipt_aliases has no owner_id: give it back the original household-only trigger so the new one can't touch it.
create or replace function public._legacy_household_sync_check() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' and new.created_by is not null and new.created_by <> auth.uid() then
    new.created_by := auth.uid();
  end if;
  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
    new.household_id := old.household_id;
    if new.updated_at < old.updated_at then
      return old;
    end if;
  end if;
  new.server_updated_at := now();
  return new;
end;
$$;
drop trigger if exists receipt_aliases_sync_check on public.receipt_aliases;
create trigger receipt_aliases_sync_check before insert or update on public.receipt_aliases
  for each row execute function public._legacy_household_sync_check();

-- 1. Sync trigger: personal only -------------------------------------------------------------------------------
create or replace function public._sync_columns_check() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    -- Author can't be spoofed: created_by must be the caller on insert (or null for adopted offline data).
    if new.created_by is not null and new.created_by <> auth.uid() then
      new.created_by := auth.uid();
    end if;
    new.household_id := null;
    -- Always the caller's personal space (service-role inserts must name an owner).
    new.owner_id := coalesce(auth.uid(), new.owner_id);
  end if;
  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;       -- immutable
    new.household_id := null;               -- household sharing was removed: everything is personal
    if old.owner_id is not null then
      new.owner_id := old.owner_id;         -- owners never change
    else
      new.owner_id := coalesce(new.owner_id, old.created_by);  -- legacy household row being moved (step 2)
    end if;
    if new.updated_at < old.updated_at then  -- stale write: keep the newer row (LWW on the server too)
      return old;
    end if;
  end if;
  new.server_updated_at := now();
  return new;
end;
$$;

-- 2. Move every household row to its owner's personal space ------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['categories', 'recipes', 'pantry_items', 'meal_plan_entries', 'shopping_items', 'barcode_items'] loop
    execute format($f$
      update public.%1$I r
         set owner_id = coalesce(
               r.created_by,
               (select h.created_by from public.households h where h.id = r.household_id),
               (select m.user_id from public.household_members m
                 where m.household_id = r.household_id and m.role = 'owner'
                 order by m.joined_at limit 1)),
             household_id = null,
             updated_at = greatest(r.updated_at, now())
       where r.household_id is not null
         and coalesce(
               r.created_by,
               (select h.created_by from public.households h where h.id = r.household_id),
               (select m.user_id from public.household_members m
                 where m.household_id = r.household_id and m.role = 'owner'
                 order by m.joined_at limit 1)) is not null;
    $f$, t);
  end loop;
end;
$$;

-- 3. RLS: the personal owner only ---------------------------------------------------------------------------------
create or replace function public.can_access_sync_row(p_household uuid, p_owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_household is null and p_owner is not null and p_owner = auth.uid();
$$;

-- 4. Household RPCs refuse (tables stay; nothing new can be shared) -----------------------------------------------
create or replace function public.create_household(p_name text)
returns table (id uuid, invite_code text)
language plpgsql security definer set search_path = public, extensions as $$
begin
  raise exception 'Household sharing was removed in My Recipe App 1.0.6.';
end;
$$;

create or replace function public.join_household(p_code text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
begin
  raise exception 'Household sharing was removed in My Recipe App 1.0.6.';
end;
$$;

revoke all on function public.create_household(text), public.join_household(text) from public, anon;
grant execute on function public.create_household(text), public.join_household(text) to authenticated;
