-- Von Hand festgelegte Reihenfolge der Zeitleiste (Schlüssel der Orte und Verschiebungen).
alter table trips add column if not exists timeline_order text[] not null default '{}';
