create table if not exists event_notification_schedules (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  notification_type text not null,
  scheduled_at timestamptz not null,
  sent_at timestamptz null,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  last_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_notification_schedules_type_check
    check (notification_type in ('event_created')),
  constraint event_notification_schedules_status_check
    check (status in ('pending', 'sent', 'skipped', 'failed')),
  constraint event_notification_schedules_attempt_count_check
    check (attempt_count >= 0)
);

create unique index if not exists event_notification_schedules_event_type_unique_idx
  on event_notification_schedules(event_id, notification_type);

create index if not exists event_notification_schedules_pending_due_idx
  on event_notification_schedules(scheduled_at, id)
  where status = 'pending';

