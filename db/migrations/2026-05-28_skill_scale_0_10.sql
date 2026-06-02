update team_members
set goalkeeper_score = least(10, greatest(0, case when goalkeeper_score > 10 then round(goalkeeper_score::numeric / 10)::int else goalkeeper_score end)),
    defense_score = least(10, greatest(0, case when defense_score > 10 then round(defense_score::numeric / 10)::int else defense_score end)),
    attack_score = least(10, greatest(0, case when attack_score > 10 then round(attack_score::numeric / 10)::int else attack_score end));

alter table team_members
  alter column goalkeeper_score set default 0,
  alter column defense_score set default 5,
  alter column attack_score set default 5;

alter table team_members
  drop constraint if exists team_members_goalkeeper_score_check,
  drop constraint if exists team_members_defense_score_check,
  drop constraint if exists team_members_attack_score_check;

alter table team_members
  add constraint team_members_goalkeeper_score_check
    check (goalkeeper_score between 0 and 10),
  add constraint team_members_defense_score_check
    check (defense_score between 0 and 10),
  add constraint team_members_attack_score_check
    check (attack_score between 0 and 10);
