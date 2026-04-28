alter table users
  add column if not exists can_create_team boolean not null default false;
