create table if not exists team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  invited_email text not null,
  role text not null default 'member',
  status text not null default 'pending',
  invited_by_user_id uuid not null references users(id),
  message text null,
  expires_at timestamptz not null,
  responded_at timestamptz null,
  revoked_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_invites_role_check
    check (role in ('member', 'vice_captain')),
  constraint team_invites_status_check
    check (status in ('pending', 'accepted', 'declined', 'revoked', 'expired'))
);

create unique index if not exists team_invites_one_pending_per_team_email_idx
  on team_invites(team_id, lower(invited_email))
  where status = 'pending';

create index if not exists team_invites_email_idx
  on team_invites(lower(invited_email));

create index if not exists team_invites_team_status_idx
  on team_invites(team_id, status);

create index if not exists team_invites_invited_by_idx
  on team_invites(invited_by_user_id);
