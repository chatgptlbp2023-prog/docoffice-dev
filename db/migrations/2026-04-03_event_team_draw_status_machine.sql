create table if not exists event_team_draws (
  event_id uuid primary key references events(id) on delete cascade,
  team_a_json jsonb not null default '[]'::jsonb,
  team_b_json jsonb not null default '[]'::jsonb,
  totals_json jsonb not null default '{}'::jsonb,
  settings_json jsonb not null default '{}'::jsonb,
  within_tolerance boolean not null default false,
  status text not null default 'saved',
  published_at timestamptz null,
  stale_at timestamptz null,
  created_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists event_team_draws
  add column if not exists status text;

alter table if exists event_team_draws
  add column if not exists published_at timestamptz;

alter table if exists event_team_draws
  add column if not exists stale_at timestamptz;

update event_team_draws
set status = 'saved'
where status is null
   or trim(status) = ''
   or status not in ('saved', 'published', 'stale');

alter table event_team_draws
  alter column status set default 'saved';

alter table event_team_draws
  alter column status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_team_draws_status_check'
  ) then
    alter table event_team_draws
      add constraint event_team_draws_status_check
      check (status in ('saved', 'published', 'stale'));
  end if;
end $$;
