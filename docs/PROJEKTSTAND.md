# Projektstand (Stand 11.11.2026)

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
- [ ] Netzwerkzugriff für Paketinstallationen (`npm install`) in den Claude-Einstellungen erlauben und einen neuen Chat starten. Im bisherigen Chat war Bash ohne Netzwerk, daher wurde noch kein Code erzeugt.

## Nächster Schritt: Phase 1

1. Next.js-Projekt (App Router, TypeScript strict, Tailwind, shadcn/ui) im Repo anlegen
2. Supabase-Anbindung mit `@supabase/ssr`, Magic-Link-Login
3. Datenbankschema aus Konzept v2 als Migration unter `supabase/migrations/`
4. RLS auf allen Tabellen und im Storage, dazu ein Test
5. Mobile-first-Grundlayout, PWA-Manifest
6. Vercel-Deployment aus `main`
