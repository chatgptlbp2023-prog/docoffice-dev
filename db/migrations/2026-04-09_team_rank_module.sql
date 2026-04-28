alter table teams
  add column if not exists rank_module_enabled boolean not null default false;

alter table team_members
  add column if not exists rank_value integer not null default 10;

alter table team_members
  add column if not exists rank_status text not null default 'guest';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'team_members_rank_value_check'
  ) then
    alter table team_members
      add constraint team_members_rank_value_check
      check (rank_value between 1 and 10);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'team_members_rank_status_check'
  ) then
    alter table team_members
      add constraint team_members_rank_status_check
      check (rank_status in ('guest', 'ranked'));
  end if;
end $$;
