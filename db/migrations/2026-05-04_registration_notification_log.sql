create table if not exists registration_notification_log (
  id uuid primary key default gen_random_uuid(),
  created_user_id uuid null references users(id) on delete set null,
  created_user_email text null,
  created_user_registration_path text null,
  recipient_email text not null,
  email_subject text not null,
  platform_name text not null,
  counts_snapshot jsonb not null default '[]'::jsonb,
  delivery_status text not null,
  delivery_reason text null,
  delivery_error text null,
  delivery_message_id text null,
  attempted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists registration_notification_log_attempted_idx
  on registration_notification_log(attempted_at desc);

create index if not exists registration_notification_log_created_user_idx
  on registration_notification_log(created_user_id, attempted_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'registration_notification_log_delivery_status_check'
  ) then
    alter table registration_notification_log
      add constraint registration_notification_log_delivery_status_check
      check (delivery_status in ('sent', 'skipped', 'failed'));
  end if;
end $$;
