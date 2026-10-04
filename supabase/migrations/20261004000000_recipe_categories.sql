-- My Recipe App v1.0.5: recipe categories on the Recipes tab (spec #3, docs/SYNC.md).
--
-- Categories already sync through public.categories (household-scoped, RLS, tombstones; migration
-- 20261003000000). v1.0.5 adds a user-defined display ORDER (Breakfast, Lunch, Dinner first) and makes each
-- recipe's category queryable on the server (MCP / SQL), without the app having to send new columns:
--
--   categories.sort_order  integer  ← data->'sortOrder'   (null = after ordered ones, by name)
--   recipes.category_ids   text[]   ← data->'categoryIds' ('{}' = Uncategorized)
--
-- Both are mirrors of fields in the `data` jsonb body, filled by BEFORE INSERT/UPDATE triggers, so every client
-- version (v1.0.4 included) keeps them correct and PostgREST upserts need no column changes.
-- No new tables: the existing RLS policies (members of the household only: select / insert / update, no client
-- hard deletes) and the realtime publication already cover these columns.

alter table public.categories add column if not exists sort_order integer;
alter table public.recipes add column if not exists category_ids text[] not null default '{}';

create index if not exists categories_household_order_idx on public.categories (household_id, sort_order);
create index if not exists recipes_category_ids_idx on public.recipes using gin (category_ids);

-- Mirror data->'sortOrder' (finite number) into categories.sort_order.
create or replace function public._categories_mirror_sort_order() returns trigger
language plpgsql set search_path = public as $$
begin
  if jsonb_typeof(new.data -> 'sortOrder') = 'number'
     and (new.data ->> 'sortOrder')::numeric between -2147483648 and 2147483647 then
    new.sort_order := floor((new.data ->> 'sortOrder')::numeric)::integer;
  else
    new.sort_order := null;
  end if;
  return new;
end;
$$;

-- Mirror data->'categoryIds' (array of strings) into recipes.category_ids.
create or replace function public._recipes_mirror_category_ids() returns trigger
language plpgsql set search_path = public as $$
begin
  if jsonb_typeof(new.data -> 'categoryIds') = 'array' then
    new.category_ids := coalesce(
      array(
        select e #>> '{}' from jsonb_array_elements(new.data -> 'categoryIds') as e
        where jsonb_typeof(e) = 'string'
      ),
      '{}'
    );
  else
    new.category_ids := '{}';
  end if;
  return new;
end;
$$;

revoke all on function public._categories_mirror_sort_order(), public._recipes_mirror_category_ids() from public, anon, authenticated;

drop trigger if exists categories_mirror_sort_order on public.categories;
create trigger categories_mirror_sort_order before insert or update on public.categories
  for each row execute function public._categories_mirror_sort_order();

drop trigger if exists recipes_mirror_category_ids on public.recipes;
create trigger recipes_mirror_category_ids before insert or update on public.recipes
  for each row execute function public._recipes_mirror_category_ids();

-- Backfill existing rows directly (no UPDATE through the sync triggers: keeps server_updated_at unchanged).
alter table public.categories disable trigger categories_sync_check;
alter table public.recipes disable trigger recipes_sync_check;
update public.categories set sort_order = sort_order;   -- fires categories_mirror_sort_order
update public.recipes set category_ids = category_ids; -- fires recipes_mirror_category_ids
alter table public.categories enable trigger categories_sync_check;
alter table public.recipes enable trigger recipes_sync_check;

comment on column public.categories.sort_order is 'Mirror of data.sortOrder (Recipes tab order, v1.0.5). Set by trigger.';
comment on column public.recipes.category_ids is 'Mirror of data.categoryIds (empty = Uncategorized, v1.0.5). Set by trigger.';
