-- Budget: eigene Kategorie «Transport» (Taxi, Bus, Bahn, Fähre, Shuttle).
alter table budget_entries drop constraint if exists budget_entries_category_check;
alter table budget_entries add constraint budget_entries_category_check check (category in
  ('flights','lodging','camping','car','fuel','transport','activities','passes','insurance','food','other'));
