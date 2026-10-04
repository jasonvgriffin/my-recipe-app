-- My Recipe App v1.0.6: personal cloud sync, no household needed (docs/SYNC.md "Personal space", docs/MCP.md).
--
-- Before: every synced row needed a household (household_id NOT NULL, RLS = household members only), so a
-- signed-in user without a household could not sync, and the MCP server refused them ("No household found").
--
-- Now every signed-in user has an implicit PERSONAL SPACE; a household is optional sharing on top:
--   personal row  = household_id IS NULL and owner_id = the user (only they can read/write it)
--   household row = household_id set, owner_id NULL (members of the household, unchanged)
-- Joining or creating a household moves the caller's personal rows into it (same as the app's existing
-- "adopt local data on join"), so nothing is lost or duplicated. Existing household rows are untouched.
-- receipt_aliases is not synced since v1.0.1 and stays household-only.

-- 1. Columns, constraint, indexes ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['recipes', 'categories', 'pantry_items', 'meal_plan_entries', 'shopping_items', 'barcode_items'] loop
    execute format($f$
      alter table public.%1$I add column if not exists owner_id uuid references auth.users (id) on delete cascade;
      alter table public.%1$I alter column household_id drop not null;
      alter table public.%1$I drop constraint if exists %1$s_scope_check;
      alter table public.%1$I add constraint %1$s_scope_check check (household_id is not null or owner_id is not null);
      create index if not exists %1$s_owner_updated_idx on public.%1$I (owner_id, updated_at) where household_id is null;
      comment on column public.%1$I.owner_id is 'Personal space owner (household_id is null). NULL for household rows. Set by trigger.';
    $f$, t);
  end loop;
end;
$$;

-- 2. Access check used by RLS ---------------------------------------------------------------------------------
create or replace function public.can_access_sync_row(p_household uuid, p_owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when p_household is not null then public.is_household_member(p_household)
    else p_owner is not null and p_owner = auth.uid()
  end;
$$;
revoke all on function public.can_access_sync_row(uuid, uuid) from public, anon;
grant execute on function public.can_access_sync_row(uuid, uuid) to authenticated;

-- 3. Sync trigger: stamp the personal owner, allow personal -> household moves by the owner -------------------
create or replace function public._sync_columns_check() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    -- Author can't be spoofed: created_by must be the caller on insert (or null for adopted solo data).
    if new.created_by is not null and new.created_by <> auth.uid() then
      new.created_by := auth.uid();
    end if;
    if new.household_id is null then
      -- Personal space: always the caller's (service-role inserts must name an owner).
      new.owner_id := coalesce(auth.uid(), new.owner_id);
    else
      new.owner_id := null;
    end if;
  end if;
  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;       -- immutable
    if old.household_id is null and new.household_id is not null
       and old.owner_id = auth.uid() and public.is_household_member(new.household_id) then
      new.owner_id := null;                 -- the owner shares a personal record into their household
    else
      new.household_id := old.household_id; -- otherwise records can't move between spaces
      new.owner_id := old.owner_id;
    end if;
    if new.updated_at < old.updated_at then  -- stale write: keep the newer row (LWW on the server too)
      return old;
    end if;
  end if;
  new.server_updated_at := now();
  return new;
end;
$$;

-- 4. RLS: household members (unchanged) OR the personal owner -------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['recipes', 'categories', 'pantry_items', 'meal_plan_entries', 'shopping_items', 'barcode_items'] loop
    execute format($f$
      drop policy if exists %1$s_select on public.%1$I;
      drop policy if exists %1$s_insert on public.%1$I;
      drop policy if exists %1$s_update on public.%1$I;
      create policy %1$s_select on public.%1$I for select to authenticated
        using (public.can_access_sync_row(household_id, owner_id));
      create policy %1$s_insert on public.%1$I for insert to authenticated
        with check (public.can_access_sync_row(household_id, owner_id));
      create policy %1$s_update on public.%1$I for update to authenticated
        using (public.can_access_sync_row(household_id, owner_id))
        with check (public.can_access_sync_row(household_id, owner_id));
    $f$, t);
  end loop;
end;
$$;

-- 5. Joining / creating a household shares the caller's personal space into it --------------------------------
create or replace function public._move_personal_into_household(p_household uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t text;
begin
  if auth.uid() is null or not public.is_household_member(p_household) then return; end if;
  foreach t in array array['categories', 'recipes', 'pantry_items', 'meal_plan_entries', 'shopping_items', 'barcode_items'] loop
    -- Bump updated_at so other members' devices pull the moved rows (their cursors are by updated_at).
    execute format(
      'update public.%I set household_id = $1, updated_at = greatest(updated_at, now()) where household_id is null and owner_id = auth.uid()',
      t
    ) using p_household;
  end loop;
end;
$$;
revoke all on function public._move_personal_into_household(uuid) from public, anon, authenticated;

create or replace function public.create_household(p_name text)
returns table (id uuid, invite_code text)
language plpgsql security definer set search_path = public, extensions as $$
declare h public.households;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.households (name, created_by) values (p_name, auth.uid()) returning * into h;
  insert into public.household_members (household_id, user_id, role) values (h.id, auth.uid(), 'owner');
  perform public._move_personal_into_household(h.id);
  return query select h.id, h.invite_code;
end;
$$;

create or replace function public.join_household(p_code text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare h_id uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select h.id into h_id from public.households h where h.invite_code = upper(trim(p_code));
  if h_id is null then raise exception 'invalid invite code'; end if;
  insert into public.household_members (household_id, user_id, role) values (h_id, auth.uid(), 'member')
  on conflict do nothing;
  perform public._move_personal_into_household(h_id);
  return h_id;
end;
$$;

revoke all on function public.create_household(text), public.join_household(text) from public, anon;
grant execute on function public.create_household(text), public.join_household(text) to authenticated;
