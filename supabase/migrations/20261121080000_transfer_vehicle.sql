-- Autoverschiebungen einem Mietfahrzeug zuordnen.
-- Auf dem Supabase-Projekt bereits eingespielt (idempotent, kann erneut laufen).
alter table transfers add column if not exists vehicle_id uuid references vehicles (id) on delete set null;
create index if not exists transfers_vehicle_id_idx on transfers (vehicle_id);

-- Das Fahrzeug muss zur selben Reise gehören (Varianten sind eigene Reisen).
create or replace function transfers_check_vehicle_trip()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.vehicle_id is not null
     and not exists (select 1 from vehicles v where v.id = new.vehicle_id and v.trip_id = new.trip_id) then
    raise exception 'vehicle % gehört nicht zur Reise %', new.vehicle_id, new.trip_id;
  end if;
  return new;
end $$;

drop trigger if exists transfers_vehicle_same_trip on transfers;
create trigger transfers_vehicle_same_trip
  before insert or update of vehicle_id, trip_id on transfers
  for each row execute function transfers_check_vehicle_trip();

-- Backfill (nur Autofahrten): Hat die Reise genau ein Fahrzeug, gehören alle Fahrten dazu.
-- Bei mehreren Fahrzeugen gilt das Fahrzeug, dessen Zeitraum [pickup_at, return_at] die Abfahrt
-- enthält (bei mehreren Treffern das zuletzt übernommene). Ohne eindeutigen Treffer bleibt es leer.
update transfers t
set vehicle_id = (
  select v.id
  from vehicles v
  where v.trip_id = t.trip_id
    and (
      (select count(*) from vehicles v2 where v2.trip_id = t.trip_id) = 1
      or (t.depart_at is not null
          and v.pickup_at is not null and v.return_at is not null
          and t.depart_at between v.pickup_at and v.return_at)
    )
  order by v.pickup_at desc nulls last
  limit 1
)
where t.kind = 'drive' and t.vehicle_id is null;
