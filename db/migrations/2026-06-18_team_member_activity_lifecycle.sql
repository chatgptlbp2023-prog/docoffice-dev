alter table team_members
  add column if not exists break_reminder_sent_at timestamptz null,
  add column if not exists passive_since timestamptz null,
  add column if not exists passive_reason text null;

create table if not exists team_break_action_log (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  action text not null,
  status text not null,
  message text null,
  token_jti text null,
  metadata jsonb not null default '{}'::jsonb,
  acted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists team_break_action_log_team_user_idx
  on team_break_action_log(team_id, user_id, acted_at desc);

alter table team_break_action_log
  drop constraint if exists team_break_action_log_action_check;

alter table team_break_action_log
  add constraint team_break_action_log_action_check
  check (action in ('extend_break_one_week', 'end_break'));
