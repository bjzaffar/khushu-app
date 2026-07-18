create or replace function public.check_email_exists(check_email text)
returns boolean
language plpgsql
security definer
as $$
begin
  return exists (
    select 1 from auth.users where email = check_email
  );
end;
$$;
