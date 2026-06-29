alter table email_delivery_logs
  add column if not exists delivery_batch_id uuid null;

create index if not exists email_delivery_logs_batch_idx
  on email_delivery_logs(delivery_batch_id)
  where delivery_batch_id is not null;

create index if not exists email_delivery_logs_team_template_created_idx
  on email_delivery_logs(team_id, template, created_at desc);
