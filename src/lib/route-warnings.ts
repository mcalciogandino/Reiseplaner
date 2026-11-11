import { differenceInCalendarDays, parseISO } from "date-fns";
import type { Destination } from "./destinations";
import { formatDate } from "./trips";

type Range = { start_date: string; end_date: string };
type Stop = Pick<Destination, "name" | "arrival_date" | "departure_date">;

const nights = (n: number) => (n === 1 ? "1 Nacht" : `${n} Nächte`);

/**
 * Prüft die Reiseorte (in Routenreihenfolge) auf Lücken, Überschneidungen und
 * Daten ausserhalb der Reise. Orte ohne Datum werden übersprungen.
 */
export function routeWarnings(trip: Range, stops: Stop[]): string[] {
  const warnings: string[] = [];
  const dated = stops.filter((s) => s.arrival_date && s.departure_date);

  for (const s of dated) {
    if (s.arrival_date! < trip.start_date || s.departure_date! > trip.end_date) {
      warnings.push(
        `${s.name}: liegt ausserhalb der Reisedaten (${formatDate(trip.start_date)} – ${formatDate(trip.end_date)}).`,
      );
    }
  }

  for (let i = 1; i < dated.length; i++) {
    const prev = dated[i - 1];
    const next = dated[i];
    const gap = differenceInCalendarDays(
      parseISO(next.arrival_date!),
      parseISO(prev.departure_date!),
    );
    if (gap > 0) {
      warnings.push(
        `Lücke: ${nights(gap)} ohne Ort zwischen ${prev.name} und ${next.name}.`,
      );
    } else if (gap < 0) {
      warnings.push(
        `Überschneidung: ${prev.name} und ${next.name} überlappen um ${nights(-gap)}.`,
      );
    }
  }

  if (dated.length > 0) {
    const first = dated[0];
    const last = dated[dated.length - 1];
    const lead = differenceInCalendarDays(
      parseISO(first.arrival_date!),
      parseISO(trip.start_date),
    );
    if (lead > 0) {
      warnings.push(`Lücke: ${nights(lead)} zwischen Reisestart und ${first.name}.`);
    }
    const tail = differenceInCalendarDays(
      parseISO(trip.end_date),
      parseISO(last.departure_date!),
    );
    if (tail > 0) {
      warnings.push(`Lücke: ${nights(tail)} zwischen ${last.name} und Reiseende.`);
    }
  }
  return warnings;
}
