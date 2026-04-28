create table if not exists event_attendance_marks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  status text not null,
  note text null,
  marked_by_user_id uuid not null references users(id) on delete restrict,
  marked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_attendance_marks_status_check'
  ) then
    alter table event_attendance_marks
      add constraint event_attendance_marks_status_check
      check (status in ('present', 'no_show'));
  end if;
end $$;

create unique index if not exists event_attendance_marks_event_user_unique_idx
  on event_attendance_marks(event_id, user_id);

create index if not exists event_attendance_marks_team_idx
  on event_attendance_marks(team_id, event_id);
