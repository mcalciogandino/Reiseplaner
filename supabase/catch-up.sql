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
