import type { Destination } from "./destinations";
import type { Transfer } from "./transfers";
import { formatDate } from "./trips";

export type LngLat = [number, number];
type Located = Pick<Destination, "id" | "name" | "lat" | "lng"> &
  Partial<Pick<Destination, "arrival_date" | "departure_date">>;

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/**
 * Grosskreis-Bogen zwischen zwei Punkten ([lng, lat]). Die Längengrade werden
 * fortlaufend ausgerichtet, damit Linien über den 180°-Meridian nicht quer über
 * die Karte springen.
 */
export function greatCircleArc(a: LngLat, b: LngLat, steps = 48): LngLat[] {
  const [lng1, lat1] = [rad(a[0]), rad(a[1])];
  const [lng2, lat2] = [rad(b[0]), rad(b[1])];
  const x1 = [Math.cos(lat1) * Math.cos(lng1), Math.cos(lat1) * Math.sin(lng1), Math.sin(lat1)];
  const x2 = [Math.cos(lat2) * Math.cos(lng2), Math.cos(lat2) * Math.sin(lng2), Math.sin(lat2)];
  const dot = Math.min(1, Math.max(-1, x1[0] * x2[0] + x1[1] * x2[1] + x1[2] * x2[2]));
  const omega = Math.acos(dot);
  if (omega < 1e-9) return [a, b];

  const out: LngLat[] = [];
  let prevLng = a[0];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const k1 = Math.sin((1 - t) * omega) / Math.sin(omega);
    const k2 = Math.sin(t * omega) / Math.sin(omega);
    const x = k1 * x1[0] + k2 * x2[0];
    const y = k1 * x1[1] + k2 * x2[1];
    const z = k1 * x1[2] + k2 * x2[2];
    let lng = deg(Math.atan2(y, x));
    const lat = deg(Math.atan2(z, Math.sqrt(x * x + y * y)));
    while (lng - prevLng > 180) lng -= 360;
    while (lng - prevLng < -180) lng += 360;
    prevLng = lng;
    out.push([lng, lat]);
  }
  return out;
}

export type MapPoint = {
  id: string;
  name: string;
  number: number;
  lng: number;
  lat: number;
  detail: string | null;
};
export type MapLine = { kind: "flight" | "drive" | "route"; coords: LngLat[] };
export type MapData = {
  points: MapPoint[];
  lines: MapLine[];
  bounds: [LngLat, LngLat] | null;
  unlocated: string[];
};

const hasCoords = (d: Located): d is Located & { lat: number; lng: number } =>
  d.lat !== null && d.lng !== null;

/**
 * Bereitet Orte (in Routenreihenfolge) und Verschiebungen für die Karte auf:
 * nummerierte Punkte, Linien je Verschiebung (Flug als Bogen, sonst gerade Linie)
 * und gestrichelte Linien zwischen aufeinanderfolgenden Orten ohne Verschiebung.
 */
export function buildMapData(
  destinations: Located[],
  transfers: Pick<Transfer, "kind" | "from_destination_id" | "to_destination_id">[],
): MapData {
  const byId = new Map(destinations.map((d) => [d.id, d]));
  const points: MapPoint[] = [];
  const unlocated: string[] = [];
  destinations.forEach((d, i) => {
    if (hasCoords(d)) {
      const detail =
        d.arrival_date && d.departure_date
          ? `${formatDate(d.arrival_date)} – ${formatDate(d.departure_date)}`
          : d.arrival_date
            ? `ab ${formatDate(d.arrival_date)}`
            : null;
      points.push({ id: d.id, name: d.name, number: i + 1, lng: d.lng, lat: d.lat, detail });
    }
    else unlocated.push(d.name);
  });

  const lines: MapLine[] = [];
  const covered = new Set<string>();
  const pair = (a: string, b: string) => [a, b].sort().join("|");

  for (const t of transfers) {
    const from = t.from_destination_id ? byId.get(t.from_destination_id) : undefined;
    const to = t.to_destination_id ? byId.get(t.to_destination_id) : undefined;
    if (!from || !to || !hasCoords(from) || !hasCoords(to)) continue;
    const a: LngLat = [from.lng, from.lat];
    const b: LngLat = [to.lng, to.lat];
    covered.add(pair(from.id, to.id));
    lines.push(
      t.kind === "flight"
        ? { kind: "flight", coords: greatCircleArc(a, b) }
        : { kind: "drive", coords: [a, b] },
    );
  }

  const located = destinations.filter(hasCoords);
  for (let i = 1; i < located.length; i++) {
    const prev = located[i - 1];
    const next = located[i];
    if (covered.has(pair(prev.id, next.id))) continue;
    lines.push({ kind: "route", coords: [[prev.lng, prev.lat], [next.lng, next.lat]] });
  }

  let bounds: MapData["bounds"] = null;
  if (points.length > 0) {
    const lngs = points.map((p) => p.lng);
    const lats = points.map((p) => p.lat);
    bounds = [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]];
  }
  return { points, lines, bounds, unlocated };
}

// ---------- Google-Maps-Links (ohne API-Schlüssel) ----------

export type Waypoint = { lat: number; lng: number } | string;

const wp = (p: Waypoint) =>
  typeof p === "string" ? p.trim() : `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

/** Link, der unterwegs direkt die Navigation öffnet. Höchstens 9 Zwischenstopps. */
export function googleMapsDirectionsUrl(opts: {
  origin: Waypoint;
  destination: Waypoint;
  waypoints?: Waypoint[];
  mode?: "driving" | "transit" | "walking" | "bicycling";
}): string {
  const params: string[] = [
    "api=1",
    `origin=${encodeURIComponent(wp(opts.origin))}`,
    `destination=${encodeURIComponent(wp(opts.destination))}`,
  ];
  const via = (opts.waypoints ?? []).slice(0, 9);
  if (via.length > 0) {
    params.push(`waypoints=${via.map((p) => encodeURIComponent(wp(p))).join("%7C")}`);
  }
  params.push(`travelmode=${opts.mode ?? "driving"}`);
  return `https://www.google.com/maps/dir/?${params.join("&")}`;
}

/** Link für eine Verschiebung; Flüge, Fähren und Mietwagen-Termine haben keinen Routenlink. */
export function transferMapsUrl(
  t: Pick<Transfer, "kind" | "from_destination_id" | "to_destination_id" | "from_place" | "to_place"> &
    Partial<Pick<Transfer, "from_lat" | "from_lng" | "to_lat" | "to_lng">>,
  destinations: Located[],
): string | null {
  if (t.kind !== "drive" && t.kind !== "train") return null;
  const byId = new Map(destinations.map((d) => [d.id, d]));
  const side = (
    id: string | null,
    place: string | null,
    lat: number | null | undefined,
    lng: number | null | undefined,
  ): Waypoint | null => {
    const d = id ? byId.get(id) : undefined;
    if (d && hasCoords(d)) return { lat: d.lat, lng: d.lng };
    if (d) return d.name;
    if (lat != null && lng != null) return { lat, lng };
    return place && place.trim() ? place : null;
  };
  const origin = side(t.from_destination_id, t.from_place, t.from_lat, t.from_lng);
  const destination = side(t.to_destination_id, t.to_place, t.to_lat, t.to_lng);
  if (!origin || !destination) return null;
  return googleMapsDirectionsUrl({ origin, destination, mode: t.kind === "train" ? "transit" : "driving" });
}
