-- Berechnete Strassenroute einer Autofahrt (OpenRouteService): Linie als GeoJSON,
-- Strecke in Metern und Fahrzeit in Sekunden.
alter table transfers
  add column route_geojson jsonb,
  add column route_distance_m integer,
  add column route_duration_s integer;
