create table if not exists public.user_distraction_archives (
  user_id uuid primary key references auth.users(id) on delete cascade,
  distractions jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_distraction_archives enable row level security;

drop policy if exists "Users manage their own distraction archive"
  on public.user_distraction_archives;
create policy "Users manage their own distraction archive"
  on public.user_distraction_archives for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
