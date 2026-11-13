import { TZDate } from "@date-fns/tz";
import { format, parseISO } from "date-fns";

export type TransferKind =
  | "flight" | "drive" | "ferry" | "car_pickup" | "car_return" | "train"
  | "taxi" | "bus" | "transit" | "shuttle" | "other";

export const KIND_LABELS: Record<TransferKind, string> = {
  flight: "Flug",
  drive: "Autofahrt",
  ferry: "Fähre",
  car_pickup: "Mietwagen-Übernahme",
  car_return: "Mietwagen-Rückgabe",
  train: "Zug",
  taxi: "Taxi",
  bus: "Bus",
  transit: "S-Bahn / Tram / Metro",
  shuttle: "Shuttle",
  other: "Sonstiges",
};
export const KINDS = Object.keys(KIND_LABELS) as TransferKind[];

export type Transfer = {
  id: string;
  kind: TransferKind;
  from_destination_id: string | null;
  to_destination_id: string | null;
  from_place: string | null;
  to_place: string | null;
  depart_at: string | null; // ISO, UTC
  depart_tz: string | null;
  arrive_at: string | null;
  arrive_tz: string | null;
  duration_min: number | null;
  distance_km: number | null;
  carrier: string | null;
  flight_number: string | null;
  booking_ref: string | null;
  from_lat: number | null;
  from_lng: number | null;
  to_lat: number | null;
  to_lng: number | null;
  route_geojson: unknown; // GeoJSON-LineString (OpenRouteService) oder null
  route_distance_m: number | null;
  route_duration_s: number | null;
  price: number | null;
  currency: string | null;
  notes: string | null;
};

export const TRANSFER_COLUMNS =
  "id, kind, from_destination_id, to_destination_id, from_place, to_place, depart_at, depart_tz, arrive_at, arrive_tz, duration_min, distance_km, carrier, flight_number, booking_ref, from_lat, from_lng, to_lat, to_lng, route_geojson, route_distance_m, route_duration_s, price, currency, notes";

/** Wandelt "2027-07-01T10:30" in Ortszeit der Zeitzone in einen UTC-ISO-String. */
export function localToUtcIso(local: string, timeZone: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) throw new Error("Ungültiges Datum");
  const [, y, mo, d, h, mi] = m.map(Number);
  return new Date(new TZDate(y, mo - 1, d, h, mi, 0, timeZone).getTime()).toISOString();
}

/** UTC-ISO → "2027-07-01T10:30" für <input type="datetime-local"> in der Zeitzone. */
export function utcToLocalInput(iso: string, timeZone: string): string {
  return format(new TZDate(parseISO(iso), timeZone), "yyyy-MM-dd'T'HH:mm");
}

/** UTC-ISO → "01.07.2027 10:30" in der Ortszeit. */
export function formatLocal(iso: string, timeZone: string): string {
  return format(new TZDate(parseISO(iso), timeZone), "dd.MM.yyyy HH:mm");
}

/** Dauer in Minuten aus Abfahrt/Ankunft, sonst die manuell erfasste Dauer. */
export function durationMinutes(t: Pick<Transfer, "depart_at" | "arrive_at" | "duration_min">): number | null {
  if (t.depart_at && t.arrive_at) {
    return Math.round((parseISO(t.arrive_at).getTime() - parseISO(t.depart_at).getTime()) / 60000);
  }
  return t.duration_min;
}

export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
}
