-- Remote MCP server (docs/MCP.md): per-user rate limits.
-- One row per user per window; the Edge Function calls mcp_rate_limit_hit() with the user's own JWT.
-- Returns 0 when the request is allowed, otherwise seconds to wait (the server answers HTTP 429 + Retry-After).

create table public.mcp_rate_limits (
  user_id      uuid not null references auth.users (id) on delete cascade,
  window_kind  text not null check (window_kind in ('minute', 'day')),
  window_start timestamptz not null,
  hits         integer not null default 0,
  primary key (user_id, window_kind)
);

alter table public.mcp_rate_limits enable row level security;
-- No client policies: only the security-definer function below touches this table.

create or replace function public.mcp_rate_limit_hit(p_per_minute integer, p_per_day integer)
returns integer language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  m public.mcp_rate_limits;
  d public.mcp_rate_limits;
  now_ts timestamptz := now();
begin
  if uid is null then raise exception 'not signed in'; end if;

  insert into public.mcp_rate_limits as r (user_id, window_kind, window_start, hits)
  values (uid, 'minute', date_trunc('minute', now_ts), 0)
  on conflict (user_id, window_kind) do update
    set window_start = case when r.window_start < date_trunc('minute', now_ts) then date_trunc('minute', now_ts) else r.window_start end,
        hits = case when r.window_start < date_trunc('minute', now_ts) then 0 else r.hits end
  returning * into m;

  insert into public.mcp_rate_limits as r (user_id, window_kind, window_start, hits)
  values (uid, 'day', date_trunc('day', now_ts), 0)
  on conflict (user_id, window_kind) do update
    set window_start = case when r.window_start < date_trunc('day', now_ts) then date_trunc('day', now_ts) else r.window_start end,
        hits = case when r.window_start < date_trunc('day', now_ts) then 0 else r.hits end
  returning * into d;

  if m.hits >= p_per_minute then
    return greatest(1, ceil(extract(epoch from (m.window_start + interval '1 minute' - now_ts)))::integer);
  end if;
  if d.hits >= p_per_day then
    return greatest(1, ceil(extract(epoch from (d.window_start + interval '1 day' - now_ts)))::integer);
  end if;

  update public.mcp_rate_limits set hits = hits + 1 where user_id = uid;
  return 0;
end;
$$;

revoke all on function public.mcp_rate_limit_hit(integer, integer) from public, anon;
grant execute on function public.mcp_rate_limit_hit(integer, integer) to authenticated;
