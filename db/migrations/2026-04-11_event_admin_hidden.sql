alter table events
  add column if not exists hidden_from_admin_list boolean not null default false;
