export type LngLat = [number, number];

export type RouteGeometry = { type: "LineString"; coordinates: LngLat[] };

export type RouteResult = {
  geometry: RouteGeometry;
  distanceM: number;
  durationS: number;
};

/** Nur Autofahrten werden über das Strassennetz berechnet. */
export const ROUTABLE_KINDS = ["drive"] as const;

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

/**
 * Liest die Antwort von OpenRouteService (GeoJSON-Endpunkt; zusätzlich das JSON-Format
 * mit `routes`) und liefert Linie, Strecke und Fahrzeit. Ungültige Antworten ergeben null.
 */
export function parseOrsRoute(json: unknown): RouteResult | null {
  const root = json as {
    features?: { geometry?: { coordinates?: unknown }; properties?: { summary?: { distance?: unknown; duration?: unknown } } }[];
  };
  const feature = root?.features?.[0];
  const coords = feature?.geometry?.coordinates;
  const summary = feature?.properties?.summary;
  if (!Array.isArray(coords) || coords.length < 2 || !summary) return null;

  const line: LngLat[] = [];
  for (const c of coords) {
    if (!Array.isArray(c) || typeof c[0] !== "number" || typeof c[1] !== "number") return null;
    line.push([round5(c[0]), round5(c[1])]);
  }
  const distance = Number(summary.distance);
  const duration = Number(summary.duration);
  if (!Number.isFinite(distance) || !Number.isFinite(duration)) return null;
  return {
    geometry: { type: "LineString", coordinates: line },
    distanceM: Math.round(distance),
    durationS: Math.round(duration),
  };
}

/** Prüft ein aus der Datenbank gelesenes GeoJSON und gibt nur gültige Linien zurück. */
export function asRouteLine(value: unknown): LngLat[] | null {
  const g = value as { type?: unknown; coordinates?: unknown } | null;
  if (!g || g.type !== "LineString" || !Array.isArray(g.coordinates) || g.coordinates.length < 2) return null;
  const ok = g.coordinates.every(
    (c) => Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number",
  );
  return ok ? (g.coordinates as LngLat[]) : null;
}
