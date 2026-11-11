-- Kanada-Reiseplaner: Schema laut Konzept v2 (15 Tabellen) inkl. RLS und Storage.
-- Ein gemeinsamer Account: Zugriff hat nur trips.owner_id = auth.uid().

-- ---------------------------------------------------------------------------
-- Hilfsfunktionen
-- ---------------------------------------------------------------------------
create function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------
create table trips (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text not null default 'CA',
  start_date date not null,
  end_date date not null,
  description text,
  base_currency char(3) not null default 'CHF',
  total_budget numeric(12,2),
  travel_profile jsonb not null default '{}',
  owner_id uuid not null references auth.users,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

-- Zugriffsfunktion erst nach "trips", da sie die Tabelle liest.
create function is_trip_owner(t uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (select 1 from trips where id = t and owner_id = auth.uid());
$$;

create table destinations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips on delete cascade,
  name text not null,
  description text,
  arrival_date date,
  departure_date date,
  sort_order int not null default 0,
  timezone text,
  lat numeric(9,6), lng numeric(9,6),
  lodging_name text, lodging_address text,
  lodging_checkin time, lodging_booking_ref text,
  notes text,
  source text not null default 'user' check (source in ('user','ai')),
  source_ref text,
  reviewed boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (departure_date is null or arrival_date is null or departure_date >= arrival_date)
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips on delete cascade,
  filename text not null,
  storage_path text not null,           -- trips/{trip_id}/{uuid}.pdf
  mime_type text not null,
  size_bytes int not null check (size_bytes <= 20971520),
  category text not null check (category in ('flight','lodging','car','activity','other')),
  extraction_status text not null default 'pending'
    check (extraction_status in ('pending','done','failed')),
  extracted jsonb,
  uploaded_by text,
  uploaded_at timestamptz not null default now()
);

create table transfers (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips on delete cascade,
  kind text not null check (kind in ('flight','drive','ferry','car_pickup','car_return','train','other')),
  from_destination_id uuid references destinations on delete set null,
  to_destination_id uuid references destinations on delete set null,
  from_place text, to_place text,
  depart_at timestamptz, arrive_at timestamptz,
  duration_min int, distance_km int,
  carrier text, flight_number text, booking_ref text,
  document_id uuid references documents on delete set null,
  source text not null default 'user' check (source in ('user','ai')),
  source_ref text,
  reviewed boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (arrive_at is null or depart_at is null or arrive_at >= depart_at)
);

create table lodging_options (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips on delete cascade,
  destination_id uuid not null references destinations on delete cascade,
  name text not null,
  kind text not null check (kind in ('hotel','camping','cabin','other')),
  price_per_night numeric(10,2), currency char(3) default 'CAD',
  email text, phone text, url text, notes text,
  status text not null default 'found' check (status in ('found','shortlisted','rejected','booked')),
  source text not null default 'ai' check (source in ('user','ai')),
  source_ref text,
  reviewed boolean not null default false,
  created_at timestamptz not null default now()
);

create table booking_requests (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips on delete cascade,
  lodging_option_id uuid not null references lodging_options on delete cascade,
  check_in date not null, check_out date not null,
  guests int not null default 2 check (guests > 0),
  subject text not null, body text not null,
  status text not null default 'draft'
    check (status in ('draft','opened','answered','declined')),
  opened_at timestamptz,
  created_at timestamptz not null default now(),
  check (check_out > check_in)
);

create table activities (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips on delete cascade,
  destination_id uuid references destinations on delete set null,
  title text not null,
  description text,
  priority text not null default 'medium' check (priority in ('high','medium','low')),
  status text not null default 'idea' check (status in ('idea','planned','done','dropped')),
  estimated_cost numeric(10,2),
  currency char(3) not null default 'CAD',
  url text,
  needs_reservation boolean not null default false,
  source text not null default 'user' check (source in ('user','ai')),
  source_ref text,
  reviewed boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table activity_votes (
  activity_id uuid not null references activities on delete cascade,
  voter text not null,
  primary key (activity_id, voter)
);

create table day_plans (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips on delete cascade,
  date date not null,
  destination_id uuid references destinations on delete set null,
  is_travel_day boolean not null default false,
  notes text,
  unique (trip_id, date)
);

create table day_plan_items (
  id uuid primary key default gen_random_uuid(),
  day_plan_id uuid not null references day_plans on delete cascade,
  activity_id uuid references activities on delete set null,
  transfer_id uuid references transfers on delete cascade,
  start_time time,
  end_time time,
  title text not null,
  description text,
  sort_order int not null default 0,
  source text not null default 'user' check (source in ('user','ai')),
  reviewed boolean not null default true,
  check (end_time is null or start_time is null or end_time > start_time)
);

create table exchange_rates (
  rate_date date not null,
  base char(3) not null,
  quote char(3) not null,
  rate numeric(12,6) not null check (rate > 0),
  primary key (rate_date, base, quote)
);

create table budget_entries (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips on delete cascade,
  -- Kategorien aus Konzept v2 plus Camping, Eintritte/Pässe, Versicherung.
  category text not null check (category in
    ('flights','lodging','camping','car','fuel','activities','passes','insurance','food','other')),
  description text not null,
  planned_amount numeric(10,2),
  actual_amount numeric(10,2),
  currency char(3) not null default 'CAD',
  rate_to_base numeric(12,6) check (rate_to_base is null or rate_to_base > 0),
  entry_date date,
  activity_id uuid references activities on delete set null,
  transfer_id uuid references transfers on delete set null,
  document_id uuid references documents on delete set null,
  source text not null default 'user' check (source in ('user','ai')),
  source_ref text,
  reviewed boolean not null default true,
  created_at timestamptz not null default now()
);

create table checklist_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips on delete cascade,
  list text not null default 'prep' check (list in ('prep','packing')),
  title text not null,
  due_date date,
  assignee text,
  done boolean not null default false,
  sort_order int not null default 0,
  source text not null default 'user' check (source in ('user','ai')),
  reviewed boolean not null default true
);

create table ai_conversations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips on delete cascade,
  title text,
  created_at timestamptz not null default now()
);

create table ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references ai_conversations on delete cascade,
  role text not null check (role in ('user','assistant')),
  content jsonb not null,
  input_tokens int, output_tokens int,
  created_at timestamptz not null default now()
);

-- Indizes auf Fremdschlüssel, die RLS-Policies und Listen schnell halten.
create index on destinations (trip_id, sort_order);
create index on transfers (trip_id, depart_at);
create index on lodging_options (trip_id, destination_id);
create index on booking_requests (trip_id);
create index on activities (trip_id, status);
create index on day_plan_items (day_plan_id, sort_order);
create index on budget_entries (trip_id, category);
create index on documents (trip_id);
create index on checklist_items (trip_id, list);
create index on ai_conversations (trip_id);
create index on ai_messages (conversation_id, created_at);

-- updated_at automatisch pflegen
create trigger trg_updated_at before update on trips
  for each row execute function set_updated_at();
create trigger trg_updated_at before update on destinations
  for each row execute function set_updated_at();
create trigger trg_updated_at before update on transfers
  for each row execute function set_updated_at();
create trigger trg_updated_at before update on activities
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table trips enable row level security;
create policy owner_all on trips for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Alle Tabellen mit eigener trip_id
do $$
declare t text;
begin
  foreach t in array array[
    'destinations','documents','transfers','lodging_options','booking_requests',
    'activities','day_plans','budget_entries','checklist_items','ai_conversations'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy owner_all on %I for all to authenticated
         using (is_trip_owner(trip_id)) with check (is_trip_owner(trip_id))', t);
  end loop;
end $$;

-- Kindtabellen ohne trip_id: Zugriff über die Elterntabelle
alter table activity_votes enable row level security;
create policy owner_all on activity_votes for all to authenticated
  using (exists (select 1 from activities a
                 where a.id = activity_id and is_trip_owner(a.trip_id)))
  with check (exists (select 1 from activities a
                      where a.id = activity_id and is_trip_owner(a.trip_id)));

alter table day_plan_items enable row level security;
create policy owner_all on day_plan_items for all to authenticated
  using (exists (select 1 from day_plans d
                 where d.id = day_plan_id and is_trip_owner(d.trip_id)))
  with check (exists (select 1 from day_plans d
                      where d.id = day_plan_id and is_trip_owner(d.trip_id)));

alter table ai_messages enable row level security;
create policy owner_all on ai_messages for all to authenticated
  using (exists (select 1 from ai_conversations c
                 where c.id = conversation_id and is_trip_owner(c.trip_id)))
  with check (exists (select 1 from ai_conversations c
                      where c.id = conversation_id and is_trip_owner(c.trip_id)));

-- Wechselkurse: angemeldete Personen dürfen lesen; geschrieben wird nur vom
-- Cron mit dem Secret Key (der RLS umgeht).
alter table exchange_rates enable row level security;
create policy read_rates on exchange_rates for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Budget-Auswertung in Basiswährung (RLS des Aufrufers gilt)
-- ---------------------------------------------------------------------------
create view budget_summary with (security_invoker = true) as
select
  b.trip_id,
  b.category,
  sum(b.planned_amount * case when b.currency = t.base_currency then 1 else b.rate_to_base end) as planned_base,
  sum(b.actual_amount  * case when b.currency = t.base_currency then 1 else b.rate_to_base end) as actual_base,
  count(*) filter (where b.currency <> t.base_currency and b.rate_to_base is null) as missing_rates
from budget_entries b
join trips t on t.id = b.trip_id
group by b.trip_id, b.category;

-- ---------------------------------------------------------------------------
-- Storage: privater Bucket, Pfad trips/{trip_id}/{datei}
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 20971520,
        array['application/pdf','image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do nothing;

create policy docs_rw on storage.objects for all to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'trips'
    and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and is_trip_owner(((storage.foldername(name))[2])::uuid)
  )
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'trips'
    and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and is_trip_owner(((storage.foldername(name))[2])::uuid)
  );
