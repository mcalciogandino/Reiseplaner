# Projektstand (Stand 11.11.2026, nach Phase 1)

Grundlage: Projekt «Kanada Travel Planner», Dokument «Konzept v2». Dieses Dokument hält die Entscheide und Angaben aus dem Planungs-Chat fest, damit ein neuer Chat ohne Rückfragen weitermachen kann.

## Entscheide

| Thema | Entscheid |
| --- | --- |
| Kurs-API CAD → CHF | Frankfurter-API (EZB-Tageskurse, kein Schlüssel nötig), täglicher Abruf per Cron |
| Claude-Abo für die Entwicklung | Pro (MVP ca. 3–4 Wochen) |
| Login | Ein gemeinsamer Account, Magic Link an eine gemeinsame E-Mail-Adresse |
| Reisedaten | Variabel: Platzhalter setzen, in der App änderbar |
| Umfang | Schlanke Variante laut Konzept v2 (ein Assistent, Mail-App statt Versanddienst, kein Realtime, kein Offline, kein Einladungsflow) |
| Basiswährung | CHF, CAD wird umgerechnet |
| Route | Vancouver → Whistler → Jasper → Banff → Calgary |
| Sprache / Format | Deutsch (CH), Datum TT.MM.JJJJ, 24-h-Zeit |

## Zugänge und Konfiguration

- **GitHub:** https://github.com/mcalciogandino/Reiseplaner (Branch `main`, privat)
- **Supabase-Projekt-URL:** `https://zhocdebybwsffaauiohm.supabase.co` (Region EU, Frankfurt vorgesehen)
- **Supabase Publishable Key:** `sb_publishable_U-W36SHBVDIbzl8Rlgng0g_0y6JscGq`
  - Öffentlicher Browser-Key (Nachfolger des `anon`-Keys), darf im Frontend stehen. Zugriffsschutz liegt in RLS.
  - Gehört in `.env.local` und in die Vercel-Umgebungsvariablen:
    - `NEXT_PUBLIC_SUPABASE_URL`
    - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- **Niemals ins Repo oder in den Chat:** Supabase Secret Key (`sb_secret_…`) bzw. `service_role`, Anthropic-API-Key. Diese nur als Server-Umgebungsvariablen in Vercel bzw. lokal in `.env.local` (steht in `.gitignore`).

## Offen

- [ ] Gemeinsame E-Mail-Adresse für den Magic Link (Account in Supabase unter Authentication → Users anlegen, Magic Link in den Auth-Einstellungen aktivieren, Redirect-URLs eintragen)
- [ ] Vornamen der beiden Personen (für «Wer bist du?»)
- [ ] Gesamtbudget in CHF und Reiseprofil (optional, später in der App)
- [ ] Vercel-Konto mit GitHub verbinden
- [ ] Anthropic-API-Key mit Guthaben (erst ab Phase 3 nötig)
- [ ] Sentry (optional, später)
- [x] Netzwerkzugriff für Paketinstallationen (erledigt, `npm install` funktioniert)

## Phase 1: Stand

Im Code erledigt (Branch `phase-1`):

1. Next.js 16 (App Router, TypeScript strict, Tailwind 4), UI-Bausteine im shadcn-Stil von Hand (`src/components/ui`), da `ui.shadcn.com` im Claude-Arbeitsbereich nicht erreichbar ist
2. Supabase-Anbindung mit `@supabase/ssr`, Magic-Link-Login (`/login`, `/auth/callback`), Sessionschutz in `src/proxy.ts` (in Next 16 heisst `middleware` jetzt `proxy`)
3. Migration `supabase/migrations/20261111000000_initial_schema.sql`: 15 Tabellen, Constraints, `budget_summary`-View, privater Storage-Bucket `documents`
4. RLS auf allen Tabellen und im Storage; `npm test` führt die Migration auf Postgres (PGlite) aus und prüft 40 Fälle, darunter «fremder Nutzer sieht nichts»
5. Mobile-first-Grundlayout, PWA-Manifest und Icons (Platzhalter), Schrift Geist selbst gehostet (`geist`-Paket)
6. `npm run lint`, `npm run typecheck`, `npm test` und `npm run build` laufen sauber

Budgetkategorien wurden um `camping`, `passes` und `insurance` erweitert.

## Von dir zu erledigen, bevor Phase 1 live läuft

1. **Migration einspielen:** Supabase → SQL Editor → Inhalt der Migrationsdatei einfügen und ausführen (oder später per `supabase db push`).
2. **Account anlegen:** Supabase → Authentication → Users → «Add user» mit der gemeinsamen E-Mail-Adresse.
3. **Auth-Einstellungen:** Authentication → URL Configuration: Site URL und Redirect-URLs `http://localhost:3000/auth/callback` sowie die spätere Vercel-Adresse `https://<projekt>.vercel.app/auth/callback` eintragen.
4. **Mail-Vorlage für Magic Link:** Authentication → Email Templates → «Magic Link»: Link auf `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email` ändern. Dann funktioniert der Link auch, wenn er auf einem anderen Gerät geöffnet wird als dem, auf dem er angefordert wurde.
5. **Vercel:** Repo importieren, Umgebungsvariablen `NEXT_PUBLIC_SUPABASE_URL` und `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` setzen.

## Phase 2, Schritt 1: Reisen als eigene Projekte

Jede Reise ist ein eigenes Projekt mit Name, Startort, Zielort, Start- und Enddatum (`trips`, neue Spalten `origin` und `destination`). Die Startseite listet alle Reisen, «Neue Reise» legt eine an, `/trips/[tripId]` zeigt die Übersicht. Alle weiteren Module hängen später unter der jeweiligen Reise.

**Neue Migration einspielen:** `supabase/migrations/20261111120000_trip_origin_destination.sql` im SQL Editor ausführen.

## Phase 2, Schritt 2: Reiseorte

Reiseorte (`destinations`) unter jeder Reise: anlegen, bearbeiten, löschen, per Pfeil umsortieren. Felder: Ort, Ankunft, Abreise, Zeitzone, Beschreibung, Unterkunft (Name, Adresse, Check-in, Buchungsnummer), Notizen. Die Übersicht warnt bei Lücken, Überschneidungen und Daten ausserhalb der Reise (`src/lib/route-warnings.ts`, getestet). Reisen lassen sich bearbeiten und löschen. Keine neue Migration nötig.

## Nächster Schritt: Phase 2 (Rest)

Verschiebungen, Bucket List, Tagesplan, Budget und Dashboard; «Wer bist du?» pro Gerät.
