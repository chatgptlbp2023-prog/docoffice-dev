alter table teams
  add column if not exists cash_module_enabled boolean not null default false;
