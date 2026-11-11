-- Persönliche Einstellungen des angemeldeten Accounts: API-Schlüssel und KI-Modell.
-- Nur die Person selbst darf ihre Zeile lesen und ändern (RLS).
create table if not exists user_settings (
  owner_id uuid primary key default auth.uid() references auth.users on delete cascade,
  anthropic_api_key text,
  ors_api_key text,
  ai_model text,
  updated_at timestamptz not null default now()
);

alter table user_settings enable row level security;
drop policy if exists owner_all on user_settings;
create policy owner_all on user_settings for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

revoke all on user_settings from anon;
grant select, insert, update, delete on user_settings to authenticated;
