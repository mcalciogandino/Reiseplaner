"use server";

import tzLookup from "tz-lookup";
import { cacheKey, parseNominatim, type PlaceHit } from "@/lib/geocode";
import { createClient } from "@/lib/supabase/server";

export type SearchResult =
  | { ok: true; hits: PlaceHit[] }
  | { ok: false; message: string };

// Nominatim-Nutzungsregeln: höchstens 1 Anfrage pro Sekunde, erkennbarer User-Agent,
// keine Autovervollständigung. Gesucht wird nur auf Knopfdruck; Treffer werden zwischengespeichert.
const ENDPOINT = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "Reiseplaner/1.0 (+https://github.com/mcalciogandino/Reiseplaner)";
const MIN_INTERVAL_MS = 1100;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 200;

/** Zeitzone zu Koordinaten (offline, aus den Zonengrenzen); null, wenn unbekannt. */
function zoneAt(lat: number, lng: number): string | null {
  try {
    return tzLookup(lat, lng);
  } catch {
    return null;
  }
}

const cache = new Map<string, { at: number; hits: PlaceHit[] }>();
let queue: Promise<unknown> = Promise.resolve();
let lastCall = 0;

function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastCall + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    return fn();
  });
  queue = run.catch(() => undefined);
  return run;
}

export async function searchPlaces(query: string): Promise<SearchResult> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { ok: false, message: "Bitte neu anmelden." };

  const q = String(query ?? "").trim();
  if (q.length < 3) return { ok: false, message: "Bitte mindestens 3 Zeichen eingeben." };
  if (q.length > 120) return { ok: false, message: "Die Suche ist zu lang." };

  const key = cacheKey(q);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return { ok: true, hits: cached.hits };

  try {
    const url = new URL(ENDPOINT);
    url.searchParams.set("q", q);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "5");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("accept-language", "de");
    const res = await throttled(() =>
      fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      }),
    );
    if (!res.ok) {
      console.error("geocode failed:", res.status);
      return { ok: false, message: "Die Adresssuche ist gerade nicht erreichbar." };
    }
    const hits = parseNominatim(await res.json()).map((h) => ({ ...h, timezone: zoneAt(h.lat, h.lng) }));
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
    cache.set(key, { at: Date.now(), hits });
    return { ok: true, hits };
  } catch (e) {
    console.error("geocode error:", e instanceof Error ? e.message : e);
    return { ok: false, message: "Die Adresssuche ist gerade nicht erreichbar." };
  }
}
