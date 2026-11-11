# Reiseplaner

Webanwendung zur gemeinsamen Planung einer Kanadareise (Vancouver → Whistler → Jasper → Banff → Calgary).

Konzept: siehe Projekt «Kanada Travel Planner – Konzept v2».

Stack: Next.js (App Router), Supabase (EU), Vercel, Claude API.

## Entwicklung

```bash
cp .env.example .env.local   # enthält nur öffentliche Werte
npm install
npm run dev                  # http://localhost:3000
npm test                     # RLS-Tests gegen die Migration
npm run lint && npm run typecheck && npm run build
```

Stand und offene Punkte: `docs/PROJEKTSTAND.md`.
