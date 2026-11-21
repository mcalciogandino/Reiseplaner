import { driveKm, driveMinutes } from "./transfers";

export type Vehicle = {
  id: string;
  kind: "car" | "camper" | "other";
  provider: string | null;
  vehicle_name: string | null;
  pickup_place: string | null;
  pickup_at: string | null; // ISO, UTC
  pickup_tz: string | null;
  return_place: string | null;
  return_at: string | null;
  return_tz: string | null;
  booking_ref: string | null;
  price: number | null;
  currency: string | null;
  notes: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  pickup_label: string | null;
  pickup_address: Record<string, string> | null;
  return_lat: number | null;
  return_lng: number | null;
  return_label: string | null;
  return_address: Record<string, string> | null;
  booked: boolean;
};

export const VEHICLE_COLUMNS =
  "id, kind, provider, vehicle_name, pickup_place, pickup_at, pickup_tz, return_place, return_at, return_tz, booking_ref, price, currency, notes, pickup_lat, pickup_lng, pickup_label, pickup_address, return_lat, return_lng, return_label, return_address, booked";

export const VEHICLE_LABELS: Record<Vehicle["kind"], string> = { car: "Mietwagen", camper: "Camper", other: "Fahrzeug" };

/** Fahrzeuge, die zu einem Zeitpunkt (ISO) zur Verfügung stehen; ohne Zeiten gelten sie als verfügbar. */
export function availableVehicles<T extends Pick<Vehicle, "pickup_at" | "return_at">>(vehicles: T[], atIso: string): T[] {
  return vehicles.filter((v) => (!v.pickup_at || v.pickup_at <= atIso) && (!v.return_at || atIso <= v.return_at));
}

/** Zeile für die KI: was gemietet ist und von wann bis wann. */
export function vehicleLine(v: Vehicle): string {
  const bits = [
    VEHICLE_LABELS[v.kind],
    v.provider,
    v.vehicle_name,
    v.pickup_at ? `Übernahme ${v.pickup_at}${v.pickup_place ? ` in ${v.pickup_place}` : ""}` : null,
    v.return_at ? `Rückgabe ${v.return_at}${v.return_place ? ` in ${v.return_place}` : ""}` : null,
  ];
  return `- ${bits.filter(Boolean).join(", ")}`;
}

/**
 * Fahrzeug, das für eine neue Autofahrt vorgeschlagen wird: das zur Abfahrt verfügbare (bei
 * mehreren das zuletzt übernommene), ohne Abfahrtszeit oder ohne Treffer das einzige bzw. das
 * zuletzt übernommene Fahrzeug der Reise.
 */
export function suggestVehicle<T extends Pick<Vehicle, "pickup_at" | "return_at">>(vehicles: T[], departIso: string | null): T | null {
  if (vehicles.length === 0) return null;
  const latest = (list: T[]) => [...list].sort((a, b) => (b.pickup_at ?? "").localeCompare(a.pickup_at ?? ""))[0];
  if (departIso) {
    const at = availableVehicles(vehicles, departIso);
    if (at.length > 0) return latest(at);
  }
  return vehicles.length === 1 ? vehicles[0] : latest(vehicles);
}

export type VehicleUsage = { trips: number; km: number; minutes: number; withoutKm: number };

type DriveLike = {
  vehicle_id: string | null;
  distance_km: number | null;
  route_distance_m: number | null;
  duration_min: number | null;
  route_duration_s: number | null;
};

/** Fahrten, Kilometer und Fahrzeit je Fahrzeug aus den zugeordneten Autofahrten (ohne Alternativen). */
export function vehicleUsage(drives: DriveLike[]): Map<string, VehicleUsage> {
  const usage = new Map<string, VehicleUsage>();
  for (const d of drives) {
    if (!d.vehicle_id) continue;
    const u = usage.get(d.vehicle_id) ?? { trips: 0, km: 0, minutes: 0, withoutKm: 0 };
    const km = driveKm(d);
    u.trips += 1;
    u.km += km ?? 0;
    u.minutes += driveMinutes(d) ?? 0;
    if (km === null) u.withoutKm += 1;
    usage.set(d.vehicle_id, u);
  }
  return usage;
}

/** Beschriftung in Auswahllisten: «Camper · H-C Compact Motorhome». */
export function vehicleLabel(v: Pick<Vehicle, "kind" | "provider" | "vehicle_name">): string {
  const name = [v.provider, v.vehicle_name].filter(Boolean).join(" ");
  return name ? `${VEHICLE_LABELS[v.kind]} · ${name}` : VEHICLE_LABELS[v.kind];
}
