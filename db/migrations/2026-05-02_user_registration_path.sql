alter table users
  add column if not exists registration_path text null,
  add column if not exists organizer_activity_type text null;

update users
set registration_path = case
  when can_create_team = true then 'team_sport_organizer'
  else 'invited_participant'
end
where registration_path is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_registration_path_check'
  ) then
    alter table users
      add constraint users_registration_path_check
      check (
        registration_path is null
        or registration_path in (
          'tournament_organizer',
          'team_sport_organizer',
          'activity_organizer',
          'invited_participant'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_organizer_activity_type_check'
  ) then
    alter table users
      add constraint users_organizer_activity_type_check
      check (
        organizer_activity_type is null
        or organizer_activity_type in (
          'football',
          'basketball',
          'yoga',
          'pilates',
          'running',
          'cycling',
          'hiking',
          'other'
        )
      );
  end if;
end $$;
