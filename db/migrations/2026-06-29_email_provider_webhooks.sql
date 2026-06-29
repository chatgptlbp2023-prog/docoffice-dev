alter table email_delivery_logs
  add column if not exists provider_event_id text null,
  add column if not exists provider_event_type text null,
  add column if not exists provider_payload jsonb null,
  add column if not exists delivered_at timestamptz null,
  add column if not exists bounced_at timestamptz null,
  add column if not exists complained_at timestamptz null;

alter table email_delivery_logs
  drop constraint if exists email_delivery_logs_status_check;

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

create index if not exists email_delivery_logs_provider_message_idx
  on email_delivery_logs(provider_message_id)
  where provider_message_id is not null;

create index if not exists email_delivery_logs_provider_event_idx
  on email_delivery_logs(provider_event_id)
  where provider_event_id is not null;
