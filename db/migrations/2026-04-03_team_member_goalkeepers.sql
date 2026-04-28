alter table team_members
  add column if not exists is_goalkeeper boolean not null default false;

update team_members
set is_goalkeeper = coalesce(is_goalkeeper, false);
