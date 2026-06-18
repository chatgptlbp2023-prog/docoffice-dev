alter table teams
  add column if not exists admin_guide_module_enabled boolean not null default false;
