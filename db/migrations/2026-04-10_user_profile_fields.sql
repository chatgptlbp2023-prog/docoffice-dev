alter table users
  add column if not exists nickname text null,
  add column if not exists birth_year integer null,
  add column if not exists avatar_data_url text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_birth_year_check'
  ) then
    alter table users
      add constraint users_birth_year_check
      check (
        birth_year is null
        or (
          birth_year >= 1900
          and birth_year <= 2100
        )
      );
  end if;
end $$;
