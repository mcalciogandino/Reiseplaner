-- Verbindungsvarianten: Alternativen zur gewählten Verbindung (z. B. Taxi / Bus / Schnellbahn).
-- Die gewählte Verbindung hat is_option = false; ihre Alternativen is_option = true und dieselbe option_group.
alter table transfers add column if not exists option_group uuid;
alter table transfers add column if not exists is_option boolean not null default false;
create index if not exists transfers_option_group_idx on transfers (option_group) where option_group is not null;
