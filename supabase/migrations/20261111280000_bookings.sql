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
