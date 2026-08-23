-- Increase the shared classify/generate allowance from 10 to 20 requests per
-- user in each one-hour quota window.
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
     or public.ai_request_quota.request_count < 20
  returning true into quota_granted;

  return coalesce(quota_granted, false);
end;
$$;

revoke all on function public.consume_ai_request_quota(uuid) from public;
grant execute on function public.consume_ai_request_quota(uuid) to service_role;
