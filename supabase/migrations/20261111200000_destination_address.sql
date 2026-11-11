-- Strukturierte Adresse eines Reiseortes (wird bei der Adresssuche vorausgefüllt
-- und lässt sich von Hand ergänzen).
alter table destinations
  add column addr_street text,
  add column addr_house_number text,
  add column addr_postcode text,
  add column addr_city text,
  add column addr_region text,
  add column addr_country text;
