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

## Phase 2, Schritt 3: Flüge und Verschiebungen

Flüge, Mietwagen, Fähren, Züge und Autofahrten unter jeder Reise (`transfers`): Art, Von/Nach (Reiseort oder freier Ort), Abfahrt und Ankunft in Ortszeit mit Zeitzone, Dauer, Distanz, Anbieter, Flugnummer, Buchungsnummer. Die Dauer wird aus den Zeiten berechnet, sonst gilt die manuell erfasste. Umrechnung Ortszeit ↔ UTC in `src/lib/transfers.ts` (getestet, inkl. Sommerzeit).

**Neue Migration einspielen:** `supabase/migrations/20261111180000_transfer_timezones.sql` (Spalten `depart_tz`, `arrive_tz`).

## Phase 2, Schritt 4: Karte (Stufe 1)

- **Adresssuche** beim Reiseort («Standort auf der Karte»): Server-Action `searchPlaces` fragt Nominatim (OpenStreetMap) ab, höchstens 1 Anfrage pro Sekunde, Treffer 24 h zwischengespeichert, nur auf Knopfdruck und nur angemeldet. Koordinaten und Beschriftung landen in `destinations` (`lat`, `lng`, `place_label`).
- **Karte** unter `/trips/[tripId]/map` (MapLibre, Stil OpenFreeMap ohne Konto, per `NEXT_PUBLIC_MAP_STYLE_URL` austauschbar): nummerierte Orte, Fahrten als Linien, Flüge als Bogen (Grosskreis), Orte ohne Verschiebung gestrichelt.
- **Google-Maps-Link** bei Fahrten und Zugfahrten (ohne API-Schlüssel, aus den Koordinaten gebaut).
- Auswahllisten im Dunkelmodus behoben (`color-scheme`, eigene `Select`-Komponente).

**Neue Migrationen einspielen:** `20261111190000_destination_location.sql` und `20261111200000_destination_address.sql` (strukturierte Adresse: Strasse, Nr., PLZ, Ort, Provinz, Land; wird bei der Suche ausgefüllt).

**Stufe 2 (noch offen):** Strassenrouten mit OpenRouteService (Gratis-Schlüssel nötig, `ORS_API_KEY` nur serverseitig), Koordinaten für freie Orte in Verschiebungen (Flughäfen), Tageskarte.

## Phase 2, Schritt 5: Zeitleiste, Ortsarten, Neuer Ort in der Verschiebung

- **Zeitleiste** auf der Reiseseite: Orte, Verschiebungen und freie Orte (Flughäfen …) in zeitlicher Reihenfolge (`src/lib/timeline.ts`). Rechts die Symbolleiste mit «+» zwischen den Symbolen: Ort oder Verschiebung an dieser Stelle einfügen (Vorbelegung Von/Nach bzw. Einfügeposition in der Route).
- **Ortsarten:** Stadt, Dorf, Campingplatz, Nationalpark, Ausflugsziel, Sonstiges.
- **Neuer Ort direkt in der Verschiebung** («＋ Neuer Ort anlegen …» bei Von/Nach).
- Neue Migration: `20261111210000_destination_kind.sql` (zusätzlich zu `…190000_destination_location` und `…200000_destination_address`).

## Phase 2, Schritt 6: Schätzung, Zeitzone aus dem Ort, 24-Stunden-Zeit

- **Schätzung** (`src/lib/estimate.ts`): Distanz, Dauer und Ankunft aus Verkehrsmittel und Luftlinie zwischen Start und Ziel (Flug 800 km/h + 45 min, Auto 75 km/h bei Faktor 1,3, Zug 90 km/h bei 1,25, Fähre 30 km/h). Alle Werte lassen sich überschreiben; «Neu schätzen» setzt zurück.
- **Freie Orte mit Suche** (Flughafen, Bahnhof): Koordinaten in `transfers.from_lat/from_lng/to_lat/to_lng`. Migration: `20261111220000_transfer_coordinates.sql`.
- **Zeitzone aus dem Ort**: `tz-lookup` bestimmt die IANA-Zone serverseitig aus den Koordinaten des Suchtreffers; beliebige gültige Zonen sind erlaubt, nicht nur die Liste.
- **Uhrzeiten im 24-Stunden-Format** (`DateTimeField`, `TimeInput`), «+»-Menü der Zeitleiste schliesst sich (`AddMenu`).

## Phase 2, Schritt 7: mehr Ortsarten, tippbare Auswahl, Tage in der Zeitleiste

- **Ortsarten** erweitert auf rund 40 in Gruppen (Orte, Unterkunft, Natur, Verkehr, Ausflüge, Essen und Einkaufen, Sonstiges). Migration: `20261111230000_destination_kinds_more.sql`.
- **Tippbares Auswahlfeld** (`Combobox`, wie die Google-Suche, Liste anklickbar, Pfeiltasten/Enter) für Ortsart, Reiseort bei Von/Nach und Zeitzone; mehr Zeitzonen in der Liste.
- **Zeitleiste mit Tagen:** waagrechte Linie und Überschrift «Tag 1, Tag 2 …» (ab Reisestart, Datum in Ortszeit) vor dem ersten Eintrag jedes Tages.

## Nächster Schritt: Phase 2 (Rest)

Bucket List, Tagesplan, Budget und Dashboard; «Wer bist du?» pro Gerät.
