-- Jede Reise ist ein eigenes Projekt mit Startort und Zielort.
alter table trips
  add column origin text,
  add column destination text;
