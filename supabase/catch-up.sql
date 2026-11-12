-- Holt eine Datenbank auf den aktuellen Stand (Phase 2: Karte, Adressen, Ortsarten, Routen).
-- Kann beliebig oft ausgeführt werden: bereits Vorhandenes wird übersprungen.
-- Im Supabase SQL Editor einfügen und mit «Run» ausführen.

-- Reiseorte: Standort, Adresse, Art
alter table destinations
  add column if not exists place_label text,
  add column if not exists addr_street text,
  add column if not exists addr_house_number text,
  add column if not exists addr_postcode text,
  add column if not exists addr_city text,
  add column if not exists addr_region text,
  add column if not exists addr_country text,
  add column if not exists kind text not null default 'city';

alter table destinations drop constraint if exists destinations_location_check;
alter table destinations
  add constraint destinations_location_check check (
    (lat is null and lng is null)
    or (
      lat is not null and lng is not null
      and lat between -90 and 90 and lng between -180 and 180
    )
  );

alter table destinations drop constraint if exists destinations_kind_check;
alter table destinations
  add constraint destinations_kind_check check (kind in (
    'city', 'village',
    'hotel', 'motel', 'hostel', 'lodge', 'bnb', 'vacation_rental', 'camping',
    'national_park', 'provincial_park', 'lake', 'beach', 'mountain', 'glacier',
    'waterfall', 'viewpoint', 'hiking', 'scenic_drive',
    'airport', 'train_station', 'bus_station', 'ferry_terminal', 'car_rental',
    'gas_station', 'parking', 'border',
    'attraction', 'sight', 'museum', 'activity', 'wildlife', 'ski_resort', 'winery',
    'restaurant', 'cafe', 'market', 'shopping',
    'other'
  ));

-- Verschiebungen: Koordinaten freier Orte und berechnete Strassenroute
alter table transfers
  add column if not exists from_lat numeric(9,6),
  add column if not exists from_lng numeric(9,6),
  add column if not exists to_lat numeric(9,6),
  add column if not exists to_lng numeric(9,6),
  add column if not exists route_geojson jsonb,
  add column if not exists route_distance_m integer,
  add column if not exists route_duration_s integer;

alter table transfers drop constraint if exists transfers_from_coords_check;
alter table transfers
  add constraint transfers_from_coords_check check (
    (from_lat is null and from_lng is null)
    or (from_lat is not null and from_lng is not null
        and from_lat between -90 and 90 and from_lng between -180 and 180)
  );

alter table transfers drop constraint if exists transfers_to_coords_check;
alter table transfers
  add constraint transfers_to_coords_check check (
    (to_lat is null and to_lng is null)
    or (to_lat is not null and to_lng is not null
        and to_lat between -90 and 90 and to_lng between -180 and 180)
  );

-- Einstellungen (API-Schlüssel, KI-Modell) je Account
create table if not exists user_settings (
  owner_id uuid primary key default auth.uid() references auth.users on delete cascade,
  anthropic_api_key text,
  ors_api_key text,
  ai_model text,
  updated_at timestamptz not null default now()
);
alter table user_settings enable row level security;
drop policy if exists owner_all on user_settings;
create policy owner_all on user_settings for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
revoke all on user_settings from anon;
grant select, insert, update, delete on user_settings to authenticated;

-- Checkliste: Notiz und Quelle
alter table checklist_items add column if not exists notes text;
alter table checklist_items add column if not exists source_ref text;

-- Tagesplan: Plan B
alter table day_plan_items add column if not exists plan_b boolean not null default false;
-- Buchungen: Unterkunftspreis, Preise und Hinweise bei Verschiebungen, weitere Verkehrsmittel, Mietfahrzeuge.

alter table destinations add column if not exists lodging_price numeric(10,2) check (lodging_price is null or lodging_price >= 0);
alter table destinations add column if not exists lodging_currency char(3);
alter table destinations add column if not exists lodging_checkout time;

alter table transfers add column if not exists price numeric(10,2) check (price is null or price >= 0);
alter table transfers add column if not exists currency char(3);
alter table transfers add column if not exists notes text;

alter table transfers drop constraint if exists transfers_kind_check;
alter table transfers add constraint transfers_kind_check check (kind in
  ('flight','drive','ferry','car_pickup','car_return','train','taxi','bus','transit','shuttle','other'));

create table if not exists vehicles (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips on delete cascade,
  kind text not null default 'car' check (kind in ('car','camper','other')),
  provider text,
  vehicle_name text,
  pickup_place text,
  pickup_at timestamptz,
  pickup_tz text,
  return_place text,
  return_at timestamptz,
  return_tz text,
  booking_ref text,
  price numeric(10,2) check (price is null or price >= 0),
  currency char(3),
  notes text,
  source text not null default 'user' check (source in ('user','ai')),
  source_ref text,
  reviewed boolean not null default true,
  created_at timestamptz not null default now(),
  check (return_at is null or pickup_at is null or return_at > pickup_at)
);
create index if not exists vehicles_trip_idx on vehicles (trip_id, pickup_at);
alter table vehicles enable row level security;
drop policy if exists owner_all on vehicles;
create policy owner_all on vehicles for all to authenticated
  using (is_trip_owner(trip_id)) with check (is_trip_owner(trip_id));
revoke all on vehicles from anon;
grant select, insert, update, delete on vehicles to authenticated;
