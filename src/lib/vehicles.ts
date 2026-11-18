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
