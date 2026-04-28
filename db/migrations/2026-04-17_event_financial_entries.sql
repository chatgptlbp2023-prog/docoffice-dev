create table if not exists event_financial_entries (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  attendance_status text not null,
  expected_base_amount integer not null default 0,
  expected_fee_amount integer not null default 0,
  expected_total_amount integer not null default 0,
  balance_before_event integer not null default 0,
  settlement_target_amount integer not null default 0,
  actual_paid_amount integer not null default 0,
  event_delta_amount integer not null default 0,
  balance_after_event integer not null default 0,
  recorded_by_user_id uuid not null references users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists event_financial_entries_event_user_unique_idx
  on event_financial_entries(event_id, user_id);

create index if not exists event_financial_entries_team_user_idx
  on event_financial_entries(team_id, user_id, recorded_at desc);

create index if not exists event_financial_entries_team_event_idx
  on event_financial_entries(team_id, event_id);

alter table event_financial_entries
  drop constraint if exists event_financial_entries_attendance_status_check;

alter table event_financial_entries
  add constraint event_financial_entries_attendance_status_check
  check (attendance_status in ('present', 'no_show'));

alter table event_financial_entries
  drop constraint if exists event_financial_entries_expected_base_amount_check;

alter table event_financial_entries
  add constraint event_financial_entries_expected_base_amount_check
  check (expected_base_amount >= 0);

alter table event_financial_entries
  drop constraint if exists event_financial_entries_expected_fee_amount_check;

alter table event_financial_entries
  add constraint event_financial_entries_expected_fee_amount_check
  check (expected_fee_amount >= 0);

alter table event_financial_entries
  drop constraint if exists event_financial_entries_expected_total_amount_check;

alter table event_financial_entries
  add constraint event_financial_entries_expected_total_amount_check
  check (expected_total_amount >= 0);

alter table event_financial_entries
  drop constraint if exists event_financial_entries_settlement_target_amount_check;

alter table event_financial_entries
  add constraint event_financial_entries_settlement_target_amount_check
  check (settlement_target_amount >= 0);

alter table event_financial_entries
  drop constraint if exists event_financial_entries_actual_paid_amount_check;

alter table event_financial_entries
  add constraint event_financial_entries_actual_paid_amount_check
  check (actual_paid_amount >= 0);
