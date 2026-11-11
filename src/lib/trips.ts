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
