alter table event_registrations
  drop constraint if exists chk_registration_status;

alter table event_registrations
  drop constraint if exists event_registrations_registration_status_check;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_registrations_status_check'
  ) then
    alter table event_registrations
      add constraint event_registrations_status_check
      check (registration_status in ('going', 'waiting_list', 'waiting_list_rank', 'cancelled'));
  end if;
end $$;
