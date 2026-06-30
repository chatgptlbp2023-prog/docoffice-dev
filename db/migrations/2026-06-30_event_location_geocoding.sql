alter table events
  add column if not exists location_latitude numeric null,
  add column if not exists location_longitude numeric null,
  add column if not exists location_place_id text null,
  add column if not exists location_formatted_address text null,
  add column if not exists location_geocoded_at timestamptz null;

create index if not exists events_location_coordinates_idx
  on events(location_latitude, location_longitude)
  where location_latitude is not null
    and location_longitude is not null;
