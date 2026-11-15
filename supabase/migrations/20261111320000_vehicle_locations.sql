-- Standort von Übernahme und Rückgabe eines Fahrzeugs (wie bei Reiseorten: Koordinaten, Beschriftung, Adresse).
alter table vehicles add column if not exists pickup_lat double precision;
alter table vehicles add column if not exists pickup_lng double precision;
alter table vehicles add column if not exists pickup_label text;
alter table vehicles add column if not exists pickup_address jsonb;
alter table vehicles add column if not exists return_lat double precision;
alter table vehicles add column if not exists return_lng double precision;
alter table vehicles add column if not exists return_label text;
alter table vehicles add column if not exists return_address jsonb;
