alter table teams
  add column if not exists draw_strategy text not null default 'auto_balanced';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'teams_draw_strategy_check'
  ) then
    alter table teams
      add constraint teams_draw_strategy_check
      check (draw_strategy in ('auto_balanced', 'random', 'sum_balance'));
  end if;
end $$;
