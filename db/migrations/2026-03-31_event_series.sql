
create table if not exists event_series (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  created_by_user_id uuid not null references users(id),
  title text not null,
  description text null,
  location_name text not null,
  location_address text null,
  start_at_template timestamptz not null,
  min_players integer not null,
  max_players integer not null,
  initial_event_status text not null,
  recurrence_type text not null,
  series_end_type text not null,
  series_occurrence_count integer null,
  series_until_date timestamptz null,
  generation_horizon_count integer not null default 6,
  field_size text null,
  field_quality text null,
  surface_type text null,
  game_duration_minutes integer null,
  rules_text text null,
  price_per_player numeric(10,2) null,
  payment_notes text null,
  players_on_field_total integer not null,
  substitutes_enabled boolean not null default false,
  substitutes_count integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_series_initial_event_status_check
    check (initial_event_status in ('draft', 'published')),
  constraint event_series_recurrence_type_check
    check (recurrence_type in ('weekly', 'biweekly', 'monthly')),
  constraint event_series_end_type_check
    check (series_end_type in ('occurrence_count', 'until_date'))
);

alter table events
  add column if not exists series_id uuid null references event_series(id) on delete set null;

alter table events
  add column if not exists occurrence_index integer null;

alter table events
  add column if not exists occurs_on date null;

alter table events
  add column if not exists is_exception boolean not null default false;

create index if not exists event_series_team_id_idx
  on event_series(team_id);

create index if not exists event_series_team_active_idx
  on event_series(team_id, is_active);

create index if not exists events_series_id_start_at_idx
  on events(series_id, start_at);

create unique index if not exists events_series_occurrence_unique_idx
  on events(series_id, occurrence_index)
  where series_id is not null and occurrence_index is not null;
