-- Checkliste: Notiz und Quelle (z. B. Web-Adresse der Frist) je Aufgabe.
alter table checklist_items add column if not exists notes text;
alter table checklist_items add column if not exists source_ref text;
