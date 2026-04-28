alter table events
  add column if not exists published_at timestamptz;

update events
set published_at = coalesce(published_at, created_at, now())
where status in ('published', 'finished', 'cancelled')
  and published_at is null;
