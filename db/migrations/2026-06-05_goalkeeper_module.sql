alter table teams
  add column if not exists goalkeeper_module_enabled boolean not null default true;
