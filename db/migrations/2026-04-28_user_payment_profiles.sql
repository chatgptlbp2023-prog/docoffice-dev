alter table users
  add column if not exists payment_provider text null,
  add column if not exists payment_username text null,
  add column if not exists payment_qr_data_url text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_payment_provider_check'
  ) then
    alter table users
      add constraint users_payment_provider_check
      check (
        payment_provider is null
        or payment_provider in ('revolut', 'wise')
      );
  end if;
end $$;
