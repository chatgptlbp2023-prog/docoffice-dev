alter table event_settings
  add column if not exists pricing_mode text,
  add column if not exists fixed_price_per_person numeric(10,2),
  add column if not exists total_event_cost numeric(10,2),
  add column if not exists per_player_fee integer not null default 0;

alter table event_series
  add column if not exists pricing_mode text,
  add column if not exists fixed_price_per_person numeric(10,2),
  add column if not exists total_event_cost numeric(10,2),
  add column if not exists per_player_fee integer not null default 0;

update event_settings
set
  pricing_mode = case
    when price_per_player is not null then 'fixed_per_person'
    else 'free'
  end,
  fixed_price_per_person = case
    when price_per_player is not null and fixed_price_per_person is null then price_per_player
    else fixed_price_per_person
  end,
  total_event_cost = total_event_cost,
  per_player_fee = coalesce(per_player_fee, 0)
where pricing_mode is null;

update event_series
set
  pricing_mode = case
    when price_per_player is not null then 'fixed_per_person'
    else 'free'
  end,
  fixed_price_per_person = case
    when price_per_player is not null and fixed_price_per_person is null then price_per_player
    else fixed_price_per_person
  end,
  total_event_cost = total_event_cost,
  per_player_fee = coalesce(per_player_fee, 0)
where pricing_mode is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'event_settings_pricing_mode_check'
  ) then
    alter table event_settings
      add constraint event_settings_pricing_mode_check
      check (pricing_mode in ('free', 'fixed_per_person', 'split_total_cost'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'event_settings_per_player_fee_check'
  ) then
    alter table event_settings
      add constraint event_settings_per_player_fee_check
      check (per_player_fee in (0, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'event_series_pricing_mode_check'
  ) then
    alter table event_series
      add constraint event_series_pricing_mode_check
      check (pricing_mode in ('free', 'fixed_per_person', 'split_total_cost'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'event_series_per_player_fee_check'
  ) then
    alter table event_series
      add constraint event_series_per_player_fee_check
      check (per_player_fee in (0, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500));
  end if;
end $$;
