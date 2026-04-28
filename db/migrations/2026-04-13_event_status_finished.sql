alter table events
  drop constraint if exists chk_event_status;

alter table events
  drop constraint if exists events_status_check;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'events_status_check'
  ) then
    alter table events
      add constraint events_status_check
      check (status in ('draft', 'published', 'cancelled', 'finished'));
  end if;
end $$;
