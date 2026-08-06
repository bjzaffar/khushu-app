-- Shared, durable quota for AI Edge Functions. This table has RLS enabled with
-- no client policies: only the security-definer RPC used by Edge Functions may
-- consume quota.
create table if not exists public.ai_request_quota (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0)
);

alter table public.ai_request_quota enable row level security;

create or replace function public.consume_ai_request_quota(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  quota_granted boolean;
begin
  insert into public.ai_request_quota (user_id, window_started_at, request_count)
  values (p_user_id, now(), 1)
  on conflict (user_id) do update
  set
    window_started_at = case
      when public.ai_request_quota.window_started_at <= now() - interval '1 hour'
        then now()
      else public.ai_request_quota.window_started_at
    end,
    request_count = case
      when public.ai_request_quota.window_started_at <= now() - interval '1 hour'
        then 1
      else public.ai_request_quota.request_count + 1
    end
  where public.ai_request_quota.window_started_at <= now() - interval '1 hour'
     or public.ai_request_quota.request_count < 10
  returning true into quota_granted;

  return coalesce(quota_granted, false);
end;
$$;

revoke all on function public.consume_ai_request_quota(uuid) from public;
grant execute on function public.consume_ai_request_quota(uuid) to service_role;
