-- Standort eines Reiseortes: Koordinaten (lat/lng gibt es bereits) plus die
-- Beschriftung aus der Adresssuche.
alter table destinations
  add column place_label text;

-- Koordinaten nur zusammen und im gültigen Bereich.
alter table destinations
  add constraint destinations_location_check check (
    (lat is null and lng is null)
    or (lat between -90 and 90 and lng between -180 and 180)
  );
