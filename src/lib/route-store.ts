import { fetchRoute } from "./route-service";
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

  const res = await fetchRoute(from, to);
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

