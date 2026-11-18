-- Gebucht-Markierung, Varianten (jede Variante ist eine eigene Reise mit Verweis auf die Hauptvariante) und KI-Chat.
alter table destinations add column if not exists booked boolean not null default false;
alter table transfers add column if not exists booked boolean not null default false;
alter table vehicles add column if not exists booked boolean not null default false;

alter table trips add column if not exists variant_of uuid references trips (id) on delete cascade;
alter table trips add column if not exists variant_name text;
create index if not exists trips_variant_of_idx on trips (variant_of) where variant_of is not null;

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 20000),
  proposal jsonb,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_trip_idx on chat_messages (trip_id, created_at);
alter table chat_messages enable row level security;
drop policy if exists owner_all on chat_messages;
create policy owner_all on chat_messages for all to authenticated
  using (is_trip_owner(trip_id)) with check (is_trip_owner(trip_id));
revoke all on chat_messages from anon;
grant select, insert, update, delete on chat_messages to authenticated;
