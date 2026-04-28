alter table event_attendance_marks
  add column if not exists payment_amount integer null,
  add column if not exists payment_recorded_at timestamptz null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_attendance_marks_payment_amount_check'
  ) then
    alter table event_attendance_marks
      add constraint event_attendance_marks_payment_amount_check
      check (payment_amount is null or payment_amount >= 0);
  end if;
end $$;
