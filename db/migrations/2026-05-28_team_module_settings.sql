alter table teams
  add column if not exists discipline_module_enabled boolean not null default false;
