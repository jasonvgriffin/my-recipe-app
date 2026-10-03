-- My Recipe App: households + synced tables (spec #25, docs/SYNC.md)
-- Apply with the Supabase CLI (`supabase db push`) or paste into the SQL editor of the project.
-- Uses only the anon key from the app; Row Level Security restricts every row to household members.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Households & membership
-- ---------------------------------------------------------------------------
create table public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 100),
  invite_code text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)),
  created_by  uuid not null references auth.users (id) on delete restrict,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create type public.household_role as enum ('owner', 'member');

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         public.household_role not null default 'member',
  display_name text,
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index household_members_user_idx on public.household_members (user_id);

-- Is the current user a member of the household? SECURITY DEFINER avoids RLS recursion.
create or replace function public.is_household_member(p_household uuid)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from public.household_members m where m.household_id = p_household and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_household_owner(p_household uuid)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = p_household and m.user_id = auth.uid() and m.role = 'owner'
  );
$$;

-- Create a household owned by the caller. Returns id + invite code.
create or replace function public.create_household(p_name text)
returns table (id uuid, invite_code text) language plpgsql security definer set search_path = public, extensions as $$
declare h public.households;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.households (name, created_by) values (p_name, auth.uid()) returning * into h;
  insert into public.household_members (household_id, user_id, role) values (h.id, auth.uid(), 'owner');
  return query select h.id, h.invite_code;
end;
$$;

-- Join a household with its invite code (as member). Idempotent.
create or replace function public.join_household(p_code text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare h_id uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select h.id into h_id from public.households h where h.invite_code = upper(trim(p_code));
  if h_id is null then raise exception 'invalid invite code'; end if;
  insert into public.household_members (household_id, user_id, role) values (h_id, auth.uid(), 'member')
  on conflict do nothing;
  return h_id;
end;
$$;

-- Owner can rotate the invite code (e.g. after it leaked).
create or replace function public.rotate_invite_code(p_household uuid)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare code text;
begin
  if not public.is_household_owner(p_household) then raise exception 'only the owner can rotate the code'; end if;
  update public.households set invite_code = upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)), updated_at = now()
  where id = p_household returning invite_code into code;
  return code;
end;
$$;

revoke all on function public.create_household(text), public.join_household(text), public.rotate_invite_code(uuid) from public, anon;
grant execute on function public.create_household(text), public.join_household(text), public.rotate_invite_code(uuid) to authenticated;

alter table public.households enable row level security;
alter table public.household_members enable row level security;

create policy households_select on public.households for select to authenticated
  using (public.is_household_member(id));
create policy households_update on public.households for update to authenticated
  using (public.is_household_owner(id)) with check (public.is_household_owner(id));

create policy members_select on public.household_members for select to authenticated
  using (public.is_household_member(household_id));
-- Members may leave; owners may remove members. Joining happens only via join_household().
create policy members_delete on public.household_members for delete to authenticated
  using (user_id = auth.uid() or public.is_household_owner(household_id));
create policy members_update_self on public.household_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and role = (select role from public.household_members m where m.household_id = household_members.household_id and m.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Synced tables. Common columns + a few query columns + full record in `data`.
-- updated_at is the CLIENT's last-write time (last-write-wins); deleted_at = tombstone.
-- ---------------------------------------------------------------------------
create or replace function public._sync_columns_check() returns trigger language plpgsql as $$
begin
  -- Author can't be spoofed: created_by must be the caller on insert (or null for adopted solo data).
  if tg_op = 'INSERT' and new.created_by is not null and new.created_by <> auth.uid() then
    new.created_by := auth.uid();
  end if;
  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;       -- immutable
    new.household_id := old.household_id;   -- records can't move between households
    if new.updated_at < old.updated_at then  -- stale write: keep the newer row (LWW on the server too)
      return old;
    end if;
  end if;
  new.server_updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['recipes', 'categories', 'pantry_items', 'meal_plan_entries', 'shopping_items'] loop
    execute format($f$
      create table public.%1$I (
        id                uuid primary key,
        household_id      uuid not null references public.households (id) on delete cascade,
        created_by        uuid references auth.users (id) on delete set null,
        created_at        timestamptz not null default now(),
        updated_at        timestamptz not null,
        deleted_at        timestamptz,
        server_updated_at timestamptz not null default now(),
        data              jsonb not null default '{}'::jsonb
      );
      create index %1$s_household_updated_idx on public.%1$I (household_id, updated_at);
      alter table public.%1$I enable row level security;
      create policy %1$s_select on public.%1$I for select to authenticated using (public.is_household_member(household_id));
      create policy %1$s_insert on public.%1$I for insert to authenticated with check (public.is_household_member(household_id));
      create policy %1$s_update on public.%1$I for update to authenticated
        using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
      -- No hard deletes from clients: use deleted_at tombstones.
      create trigger %1$s_sync_check before insert or update on public.%1$I
        for each row execute function public._sync_columns_check();
    $f$, t);
  end loop;
end;
$$;

-- Query columns (mirrors of fields in `data`, set by the app's row mapper; see src/sync/rows.ts).
alter table public.recipes           add column title text;
alter table public.categories        add column name text;
alter table public.pantry_items      add column name text;
alter table public.meal_plan_entries add column date date, add column recipe_id uuid;
alter table public.shopping_items    add column week_start text, add column checked boolean not null default false;
create index meal_plan_entries_date_idx on public.meal_plan_entries (household_id, date);
create index shopping_items_week_idx on public.shopping_items (household_id, week_start);

-- Optional realtime: clients may subscribe to changes on these tables (RLS still applies).
alter publication supabase_realtime add table
  public.recipes, public.categories, public.pantry_items, public.meal_plan_entries, public.shopping_items;
