alter table event_settings
  add column if not exists payment_link_provider text null,
  add column if not exists payment_link_url text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_settings_payment_link_provider_check'
  ) then
    alter table event_settings
      add constraint event_settings_payment_link_provider_check
      check (
        payment_link_provider is null
        or payment_link_provider in ('revolut', 'wise')
      );
  end if;
end $$;

alter table event_series
  add column if not exists payment_link_provider text null,
  add column if not exists payment_link_url text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_series_payment_link_provider_check'
  ) then
    alter table event_series
      add constraint event_series_payment_link_provider_check
      check (
        payment_link_provider is null
        or payment_link_provider in ('revolut', 'wise')
      );
  end if;
end $$;
