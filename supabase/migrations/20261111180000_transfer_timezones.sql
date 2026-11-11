-- Abfahrts- und Ankunftszeit sind Ortszeiten; die Zeitzone wird mitgespeichert,
-- damit die Anzeige und das Bearbeiten wieder dieselbe Uhrzeit zeigen.
alter table transfers
  add column depart_tz text,
  add column arrive_tz text;
