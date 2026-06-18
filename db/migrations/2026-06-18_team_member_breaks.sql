alter table team_members
  add column if not exists break_started_at timestamptz null,
  add column if not exists break_until timestamptz null,
  add column if not exists break_extensions_count integer not null default 0,
  add column if not exists break_reminder_sent_at timestamptz null,
  add column if not exists passive_since timestamptz null,
  add column if not exists passive_reason text null;

alter table event_email_action_log
  drop constraint if exists event_email_action_log_action_check;

alter table event_email_action_log
  add constraint event_email_action_log_action_check
  check (action in ('register', 'skip', 'vacation_one_week'));
