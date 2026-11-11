-- Art eines Reiseortes: Stadt, Dorf, Campingplatz, Nationalpark, Ausflugsziel, Sonstiges.
alter table destinations
  add column kind text not null default 'city'
  check (kind in ('city', 'village', 'camping', 'national_park', 'attraction', 'other'));
