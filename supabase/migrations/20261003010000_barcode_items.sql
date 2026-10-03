-- Household-shared barcode → product mappings (spec #27): cached Open Food Facts results and names typed by
-- household members for unknown barcodes. Same sync shape + RLS as the other synced tables.
create table public.barcode_items (
  id                uuid primary key,
  household_id      uuid not null references public.households (id) on delete cascade,
  created_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null,
  deleted_at        timestamptz,
  server_updated_at timestamptz not null default now(),
  data              jsonb not null default '{}'::jsonb,
  barcode           text not null,
  name              text
);
create index barcode_items_household_updated_idx on public.barcode_items (household_id, updated_at);
create index barcode_items_barcode_idx on public.barcode_items (household_id, barcode);
alter table public.barcode_items enable row level security;
create policy barcode_items_select on public.barcode_items for select to authenticated
  using (public.is_household_member(household_id));
create policy barcode_items_insert on public.barcode_items for insert to authenticated
  with check (public.is_household_member(household_id));
create policy barcode_items_update on public.barcode_items for update to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create trigger barcode_items_sync_check before insert or update on public.barcode_items
  for each row execute function public._sync_columns_check();
alter publication supabase_realtime add table public.barcode_items;
