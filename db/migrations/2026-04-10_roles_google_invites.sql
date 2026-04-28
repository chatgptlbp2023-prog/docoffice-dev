alter table users
  add column if not exists platform_role text not null default 'user',
  add column if not exists auth_provider text not null default 'local',
  add column if not exists google_sub text null,
  add column if not exists phone text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_platform_role_check'
  ) then
    alter table users
      add constraint users_platform_role_check
      check (platform_role in ('platform_owner', 'user'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_auth_provider_check'
  ) then
    alter table users
      add constraint users_auth_provider_check
      check (auth_provider in ('local', 'google'));
  end if;
end $$;

create unique index if not exists users_google_sub_unique_idx
  on users(google_sub)
  where google_sub is not null;

alter table team_members
  drop constraint if exists chk_team_members_role;

alter table team_members
  drop constraint if exists team_members_role_check;

update team_members
set role = case
  when role = 'captain' then 'team_admin'
  when role = 'vice_captain' then 'team_manager'
  else role
end
where role in ('captain', 'vice_captain');

alter table team_members
  add constraint team_members_role_check
  check (role in ('team_admin', 'team_manager', 'member'));

alter table team_invites
  alter column invited_email drop not null;

alter table team_invites
  add column if not exists token text,
  add column if not exists invite_code text,
  add column if not exists invited_phone text null,
  add column if not exists max_uses integer not null default 1,
  add column if not exists used_count integer not null default 0;

update team_invites
set role = case
  when role = 'vice_captain' then 'team_manager'
  else role
end
where role in ('vice_captain', 'member');

update team_invites
set token = md5(random()::text || clock_timestamp()::text || id::text) || md5(id::text || random()::text)
where token is null;

update team_invites
set invite_code = upper(substr(replace(id::text, '-', ''), 1, 10))
where invite_code is null;

drop index if exists team_invites_one_pending_per_team_email_idx;

create unique index if not exists team_invites_one_pending_per_team_email_idx
  on team_invites(team_id, lower(invited_email))
  where status = 'pending' and invited_email is not null;

create unique index if not exists team_invites_token_unique_idx
  on team_invites(token);

create unique index if not exists team_invites_invite_code_unique_idx
  on team_invites(invite_code);

alter table team_invites
  drop constraint if exists team_invites_role_check;

alter table team_invites
  add constraint team_invites_role_check
  check (role in ('member', 'team_manager'));
