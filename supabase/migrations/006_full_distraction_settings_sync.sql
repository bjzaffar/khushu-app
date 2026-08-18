alter table public.user_distraction_archives
  add column if not exists active_distractions jsonb not null default '[]'::jsonb,
  add column if not exists hidden_distractions jsonb not null default '[]'::jsonb,
  add column if not exists custom_label_registry jsonb not null default '[]'::jsonb,
  add column if not exists historical_custom_labels jsonb not null default '[]'::jsonb,
  add column if not exists settings_version integer not null default 1;
