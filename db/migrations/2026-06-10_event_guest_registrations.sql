create table if not exists event_guest_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  host_user_id uuid not null references users(id) on delete cascade,
  guest_name text not null,
  registration_status varchar(20) not null,
  registered_at timestamptz not null default now(),
  cancelled_at timestamptz null,
  promoted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_guest_registrations_status_check
    check (registration_status in ('going', 'waiting_list', 'cancelled')),
  constraint event_guest_registrations_guest_name_check
    check (length(trim(guest_name)) between 2 and 120),
  constraint event_guest_registrations_cancelled_at_check
    check (
      (registration_status = 'cancelled' and cancelled_at is not null)
      or registration_status <> 'cancelled'
    )
);

create unique index if not exists ux_event_guest_registrations_active_host
  on event_guest_registrations(event_id, host_user_id)
  where registration_status in ('going', 'waiting_list');

create index if not exists idx_event_guest_registrations_event_id
  on event_guest_registrations(event_id);

create index if not exists idx_event_guest_registrations_team_id
  on event_guest_registrations(team_id);

create index if not exists idx_event_guest_registrations_host_user_id
  on event_guest_registrations(host_user_id);

create index if not exists idx_event_guest_registrations_status
  on event_guest_registrations(registration_status);

create index if not exists idx_event_guest_registrations_registered_at
  on event_guest_registrations(registered_at);
