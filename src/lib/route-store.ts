import { fetchRoute } from "./route-service";
import { TRANSFER_COLUMNS } from "./transfers";
import { loadSettings } from "./settings";
import { ROUTABLE_KINDS } from "./routing";
import type { createClient } from "./supabase/server";
import type { Transfer } from "./transfers";

type Supabase = Awaited<ReturnType<typeof createClient>>;

type RouteInput = Pick<
  Transfer,
  "from_destination_id" | "to_destination_id" | "from_lat" | "from_lng" | "to_lat" | "to_lng"
> & { kind: string };

const NO_ROUTE = { route_geojson: null, route_distance_m: null, route_duration_s: null };

/**
 * Berechnet die Strassenroute einer Autofahrt (OpenRouteService) und speichert sie.
 * Für andere Arten oder ohne Koordinaten wird eine alte Route entfernt. Fehler brechen das
 * Speichern der Verschiebung nie ab; der Aufrufer bekommt nur eine Meldung.
 */
export async function storeRoute(
  supabase: Supabase,
  tripId: string,
  transferId: string,
  t: RouteInput,
): Promise<{ ok: boolean; message: string }> {
  const reset = () => supabase.from("transfers").update(NO_ROUTE).eq("id", transferId).eq("trip_id", tripId);
  if (!(ROUTABLE_KINDS as readonly string[]).includes(t.kind)) {
    await reset();
    return { ok: false, message: "Strassenrouten gibt es nur für Autofahrten." };
  }

  const ids = [t.from_destination_id, t.to_destination_id].filter((x): x is string => !!x);
  const { data: rows } = ids.length
    ? await supabase.from("destinations").select("id, lat, lng").in("id", ids).eq("trip_id", tripId)
    : { data: [] };
  const coords = new Map((rows ?? []).map((r) => [r.id as string, r as { lat: number | null; lng: number | null }]));
  const point = (id: string | null, lat: number | null, lng: number | null) => {
    const d = id ? coords.get(id) : undefined;
    if (d) return d.lat !== null && d.lng !== null ? { lat: Number(d.lat), lng: Number(d.lng) } : null;
    return lat !== null && lng !== null ? { lat: Number(lat), lng: Number(lng) } : null;
  };
  const from = point(t.from_destination_id, t.from_lat, t.from_lng);
  const to = point(t.to_destination_id, t.to_lat, t.to_lng);
  if (!from || !to) {
    await reset();
    return { ok: false, message: "Start oder Ziel hat noch keinen Standort." };
  }

  const { orsKey } = await loadSettings(supabase);
  const res = await fetchRoute(from, to, orsKey);
  if (!res.ok) {
    if (res.reason !== "failed") await reset();
    return { ok: false, message: res.message };
  }
  const { error } = await supabase
    .from("transfers")
    .update({
      route_geojson: res.route.geometry,
      route_distance_m: res.route.distanceM,
      route_duration_s: res.route.durationS,
    })
    .eq("id", transferId)
    .eq("trip_id", tripId);
  if (error) {
    console.error("storeRoute failed:", error.code, error.message);
    return { ok: false, message: "Die Route konnte nicht gespeichert werden." };
  }
  const km = Math.round(res.route.distanceM / 1000);
  const min = Math.round(res.route.durationS / 60);
  return { ok: true, message: `Route berechnet: ${km} km, ${Math.floor(min / 60)} h ${min % 60} min.` };
}


/** Obergrenze je Aufruf: schont den Routendienst und die Antwortzeit. */
const REFRESH_LIMIT = 12;

/**
 * Berechnet Autofahrten neu, deren Route nicht mehr stimmt oder fehlt:
 * - Fahrten, die an einem der übergebenen Orte starten oder enden (Standort geändert), und
 * - Fahrten ohne Route, bei denen Start und Ziel inzwischen einen Standort haben.
 * Best effort: Fehler des Routendienstes werden verschluckt. Liefert die Zahl berechneter Routen.
 */
export async function refreshRoutes(supabase: Supabase, tripId: string, changedDestinationIds: string[] = []): Promise<number> {
  const { data } = await supabase.from("transfers").select(TRANSFER_COLUMNS).eq("trip_id", tripId).eq("kind", "drive");
  const legs = (data ?? []) as unknown as Transfer[];
  if (!legs.length) return 0;

  const changed = new Set(changedDestinationIds);
  const ids = [...new Set(legs.flatMap((t) => [t.from_destination_id, t.to_destination_id]).filter((x): x is string => !!x))];
  const { data: rows } = ids.length ? await supabase.from("destinations").select("id, lat, lng").in("id", ids).eq("trip_id", tripId) : { data: [] };
  const located = new Map((rows ?? []).map((r) => [r.id as string, r.lat !== null && r.lng !== null]));
  const hasPoint = (id: string | null, lat: number | null, lng: number | null) => (id && located.has(id) ? located.get(id)! : lat !== null && lng !== null);

  const todo = legs.filter((t) => {
    const touched = (t.from_destination_id && changed.has(t.from_destination_id)) || (t.to_destination_id && changed.has(t.to_destination_id));
    const missing = !t.route_geojson && hasPoint(t.from_destination_id, t.from_lat, t.from_lng) && hasPoint(t.to_destination_id, t.to_lat, t.to_lng);
    return touched || missing;
  });

  let done = 0;
  for (const t of todo.slice(0, REFRESH_LIMIT)) {
    try {
      if ((await storeRoute(supabase, tripId, t.id, t)).ok) done++;
    } catch (err) {
      console.error("refreshRoutes failed:", err instanceof Error ? err.name : "unknown");
    }
  }
  return done;
}
