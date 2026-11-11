import { parseOrsRoute, type RouteResult } from "./routing";

type Point = { lat: number; lng: number };

export type RouteOutcome =
  | { ok: true; route: RouteResult }
  | { ok: false; reason: "no_key" | "no_route" | "failed"; message: string };

const ENDPOINT = "https://api.openrouteservice.org/v2/directions/driving-car/geojson";

/**
 * Berechnet die Strassenroute zwischen zwei Punkten über OpenRouteService.
 * Nur auf dem Server verwenden: der Schlüssel (Einstellungen bzw. ORS_API_KEY) darf nie in den Browser.
 */
export async function fetchRoute(from: Point, to: Point, apiKey?: string | null): Promise<RouteOutcome> {
  const key = apiKey ?? process.env.ORS_API_KEY;
  if (!key) {
    return { ok: false, reason: "no_key", message: "Kein Routen-Schlüssel eingerichtet (unter «Einstellungen» hinterlegen)." };
  }
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: key,
        "Content-Type": "application/json; charset=utf-8",
        Accept: "application/geo+json, application/json",
      },
      body: JSON.stringify({
        coordinates: [[from.lng, from.lat], [to.lng, to.lat]],
        geometry_simplify: true,
        instructions: false,
      }),
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    if (res.status === 404 || res.status === 400) {
      // z. B. Code 2010: kein befahrbarer Punkt in 350 m Umkreis
      return { ok: false, reason: "no_route", message: "Zwischen diesen Punkten wurde keine Strassenroute gefunden." };
    }
    if (!res.ok) {
      console.error("ORS request failed:", res.status);
      return { ok: false, reason: "failed", message: "Der Routendienst hat nicht geantwortet." };
    }
    const route = parseOrsRoute(await res.json());
    if (!route) return { ok: false, reason: "failed", message: "Die Antwort des Routendienstes war unlesbar." };
    return { ok: true, route };
  } catch (err) {
    console.error("ORS request error:", err instanceof Error ? err.name : "unknown");
    return { ok: false, reason: "failed", message: "Der Routendienst ist nicht erreichbar." };
  }
}
