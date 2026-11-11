-- Koordinaten für freie Orte einer Verschiebung (Flughäfen, Bahnhöfe …), damit
-- Distanz und Dauer geschätzt und die Route auf der Karte gezeichnet werden können.
alter table transfers
  add column from_lat numeric(9,6),
  add column from_lng numeric(9,6),
  add column to_lat numeric(9,6),
  add column to_lng numeric(9,6),
  add constraint transfers_from_coords_check check (
    (from_lat is null and from_lng is null)
    or (from_lat is not null and from_lng is not null
        and from_lat between -90 and 90 and from_lng between -180 and 180)
  ),
  add constraint transfers_to_coords_check check (
    (to_lat is null and to_lng is null)
    or (to_lat is not null and to_lng is not null
        and to_lat between -90 and 90 and to_lng between -180 and 180)
  );
