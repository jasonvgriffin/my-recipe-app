-- Household-shared receipt line aliases (spec #26): learned when a member corrects a match
-- (e.g. "gv bnls chkn" -> "chicken breast"). Same sync shape + RLS as barcode_items.
create table public.receipt_aliases (
  id                uuid primary key,
  household_id      uuid not null references public.households (id) on delete cascade,
  created_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null,
  deleted_at        timestamptz,
  server_updated_at timestamptz not null default now(),
  data              jsonb not null default '{}'::jsonb,
  alias             text not null,
  name              text
);
create index receipt_aliases_household_updated_idx on public.receipt_aliases (household_id, updated_at);
create index receipt_aliases_alias_idx on public.receipt_aliases (household_id, alias);
alter table public.receipt_aliases enable row level security;
create policy receipt_aliases_select on public.receipt_aliases for select to authenticated
  using (public.is_household_member(household_id));
create policy receipt_aliases_insert on public.receipt_aliases for insert to authenticated
  with check (public.is_household_member(household_id));
create policy receipt_aliases_update on public.receipt_aliases for update to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create trigger receipt_aliases_sync_check before insert or update on public.receipt_aliases
  for each row execute function public._sync_columns_check();
alter publication supabase_realtime add table public.receipt_aliases;
