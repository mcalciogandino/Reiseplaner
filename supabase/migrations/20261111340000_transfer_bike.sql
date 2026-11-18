-- Verkehrsmittel «Fahrrad».
alter table transfers drop constraint if exists transfers_kind_check;
alter table transfers add constraint transfers_kind_check check (kind in
  ('flight','drive','ferry','car_pickup','car_return','train','taxi','bus','transit','shuttle','bike','other'));
