create table if not exists email_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid null references teams(id) on delete set null,
  event_id uuid null references events(id) on delete set null,
  delivery_batch_id uuid null,
  recipient_user_id uuid null references users(id) on delete set null,
  recipient_email text not null,
  template text not null,
  status text not null,
  reason text null,
  provider_message_id text null,
  provider_event_id text null,
  provider_event_type text null,
  provider_payload jsonb null,
  delivered_at timestamptz null,
  bounced_at timestamptz null,
  complained_at timestamptz null,
  error_message text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table email_delivery_logs
  add column if not exists delivery_batch_id uuid null,
  add column if not exists provider_event_id text null,
  add column if not exists provider_event_type text null,
  add column if not exists provider_payload jsonb null,
  add column if not exists delivered_at timestamptz null,
  add column if not exists bounced_at timestamptz null,
  add column if not exists complained_at timestamptz null;

alter table email_delivery_logs
  drop constraint if exists email_delivery_logs_status_check;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'email_delivery_logs_status_check'
  ) then
    alter table email_delivery_logs
      add constraint email_delivery_logs_status_check
      check (status in (
        'pending',
        'sent',
        'delivered',
        'bounced',
        'complained',
        'rejected',
        'skipped',
        'failed'
      ));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'email_delivery_logs_recipient_email_check'
  ) then
    alter table email_delivery_logs
      add constraint email_delivery_logs_recipient_email_check
      check (length(trim(recipient_email)) > 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'email_delivery_logs_template_check'
  ) then
    alter table email_delivery_logs
      add constraint email_delivery_logs_template_check
      check (length(trim(template)) > 0);
  end if;
end $$;

create index if not exists email_delivery_logs_team_created_idx
  on email_delivery_logs(team_id, created_at desc);

create index if not exists email_delivery_logs_event_created_idx
  on email_delivery_logs(event_id, created_at desc);

create index if not exists email_delivery_logs_batch_idx
  on email_delivery_logs(delivery_batch_id)
  where delivery_batch_id is not null;

create index if not exists email_delivery_logs_recipient_created_idx
  on email_delivery_logs(recipient_email, created_at desc);

create index if not exists email_delivery_logs_template_status_idx
  on email_delivery_logs(template, status, created_at desc);

create index if not exists email_delivery_logs_team_template_created_idx
  on email_delivery_logs(team_id, template, created_at desc);

create index if not exists email_delivery_logs_provider_message_idx
  on email_delivery_logs(provider_message_id)
  where provider_message_id is not null;

create index if not exists email_delivery_logs_provider_event_idx
  on email_delivery_logs(provider_event_id)
  where provider_event_id is not null;
