create table if not exists team_financial_adjustments (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  adjustment_amount integer not null,
  note text null,
  balance_before_adjustment integer not null default 0,
  balance_after_adjustment integer not null default 0,
  recorded_by_user_id uuid not null references users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists team_financial_adjustments_team_user_idx
  on team_financial_adjustments(team_id, user_id, recorded_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'team_financial_adjustments_nonzero_amount_check'
  ) then
    alter table team_financial_adjustments
      add constraint team_financial_adjustments_nonzero_amount_check
      check (adjustment_amount <> 0);
  end if;
end $$;
