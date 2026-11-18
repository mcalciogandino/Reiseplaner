import type { TransferKind } from "./transfers";

export type BookStatus = "booked" | "open" | "none";

type PlaceLike = { booked: boolean; lodging_name: string | null; lodging_price: number | null; lodging_booking_ref: string | null };
type TransferLike = { booked: boolean; kind: TransferKind; booking_ref: string | null };

/** Ein Ort ist buchbar, sobald er eine Unterkunft hat (oder schon als gebucht markiert ist). */
export function placeStatus(d: PlaceLike): BookStatus {
  if (d.booked) return "booked";
  return d.lodging_name || d.lodging_price !== null || d.lodging_booking_ref ? "open" : "none";
}

const NO_BOOKING: TransferKind[] = ["drive", "car_pickup", "car_return", "transit"];

/** Verschiebungen sind buchbar, ausser eigene Fahrt, Mietwagen-Übergabe und öffentlicher Nahverkehr. */
export function transferStatus(t: TransferLike): BookStatus {
  if (t.booked) return "booked";
  return t.booking_ref || !NO_BOOKING.includes(t.kind) ? "open" : "none";
}

export function vehicleStatus(v: { booked: boolean }): BookStatus {
  return v.booked ? "booked" : "open";
}

/** Gebucht von buchbar insgesamt. */
export function bookingProgress(statuses: BookStatus[]): { booked: number; total: number } {
  const relevant = statuses.filter((s) => s !== "none");
  return { booked: relevant.filter((s) => s === "booked").length, total: relevant.length };
}

export const STATUS_CARD: Record<BookStatus, string> = {
  booked: "border-green-600 bg-green-50 dark:border-green-700 dark:bg-green-950/40",
  open: "border-dashed border-amber-600 dark:border-amber-500",
  none: "",
};
