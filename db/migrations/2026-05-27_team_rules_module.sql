alter table teams
  add column if not exists rules_module_enabled boolean not null default false,
  add column if not exists rules_text text null,
  add column if not exists rules_version integer not null default 1,
  add column if not exists rules_updated_at timestamptz null,
  add column if not exists rules_updated_by_user_id uuid null references users(id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'teams_rules_version_check'
  ) then
    alter table teams
      add constraint teams_rules_version_check
      check (rules_version >= 1);
  end if;
end $$;

create table if not exists team_rule_acceptances (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  rules_version integer not null,
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists team_rule_acceptances_team_user_version_idx
  on team_rule_acceptances(team_id, user_id, rules_version);

create index if not exists team_rule_acceptances_team_user_idx
  on team_rule_acceptances(team_id, user_id, accepted_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'team_rule_acceptances_rules_version_check'
  ) then
    alter table team_rule_acceptances
      add constraint team_rule_acceptances_rules_version_check
      check (rules_version >= 1);
  end if;
end $$;
