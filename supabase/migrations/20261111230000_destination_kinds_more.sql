-- Mehr Ortsarten (Unterkünfte, Natur, Verkehr, Ausflüge, Essen). Die frühere
-- Einschränkung wird durch die erweiterte Liste ersetzt.
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
