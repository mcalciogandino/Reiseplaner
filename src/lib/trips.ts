import { differenceInCalendarDays, format, parseISO } from "date-fns";

export type Trip = {
  id: string;
  name: string;
  origin: string | null;
  destination: string | null;
  start_date: string; // YYYY-MM-DD
  end_date: string;
  description: string | null;
};

export const TRIP_COLUMNS =
  "id, name, origin, destination, start_date, end_date, description";

/** 2027-07-01 → 01.07.2027 */
export function formatDate(iso: string): string {
  return format(parseISO(iso), "dd.MM.yyyy");
}

export function tripDays(start: string, end: string): number {
  return differenceInCalendarDays(parseISO(end), parseISO(start)) + 1;
}

export function formatRoute(trip: Pick<Trip, "origin" | "destination">): string {
  return [trip.origin, trip.destination].filter(Boolean).join(" → ");
}

type Range = Pick<Trip, "start_date" | "end_date">;

/**
 * Grenzen für <input type="date">: der Reisezeitraum. Liegt ein bestehender Wert
 * ausserhalb (Reise wurde später verkürzt), wird die Grenze erweitert, damit sich
 * der Eintrag weiter speichern lässt.
 */
export function dateBounds(range: Range, current?: string | null) {
  return {
    min: current && current < range.start_date ? current : range.start_date,
    max: current && current > range.end_date ? current : range.end_date,
  };
}

/** Wie dateBounds, für <input type="datetime-local"> ("YYYY-MM-DDTHH:mm"). */
export function dateTimeBounds(range: Range, current?: string | null) {
  const lo = `${range.start_date}T00:00`;
  const hi = `${range.end_date}T23:59`;
  return {
    min: current && current < lo ? current : lo,
    max: current && current > hi ? current : hi,
  };
}
