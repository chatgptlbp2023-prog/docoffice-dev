alter table teams
  add column if not exists skill_balancing_enabled boolean not null default true;

alter table teams
  add column if not exists skill_balance_tolerance_percent integer not null default 15;

alter table team_members
  add column if not exists skills_enabled boolean not null default true;

alter table team_members
  add column if not exists goalkeeper_score integer;

alter table team_members
  add column if not exists defense_score integer;

alter table team_members
  add column if not exists attack_score integer;

update team_members
set goalkeeper_score = coalesce(goalkeeper_score, 0),
    defense_score = coalesce(defense_score, 50),
    attack_score = coalesce(attack_score, 50),
    skills_enabled = coalesce(skills_enabled, true);

alter table team_members
  alter column goalkeeper_score set default 0;

alter table team_members
  alter column defense_score set default 50;

alter table team_members
  alter column attack_score set default 50;

alter table team_members
  alter column goalkeeper_score set not null;

alter table team_members
  alter column defense_score set not null;

alter table team_members
  alter column attack_score set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'teams_skill_balance_tolerance_percent_check'
  ) then
    alter table teams
      add constraint teams_skill_balance_tolerance_percent_check
      check (skill_balance_tolerance_percent between 0 and 100);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'team_members_goalkeeper_score_check'
  ) then
    alter table team_members
      add constraint team_members_goalkeeper_score_check
      check (goalkeeper_score between 0 and 100);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'team_members_defense_score_check'
  ) then
    alter table team_members
      add constraint team_members_defense_score_check
      check (defense_score between 0 and 100);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'team_members_attack_score_check'
  ) then
    alter table team_members
      add constraint team_members_attack_score_check
      check (attack_score between 0 and 100);
  end if;
end $$;
