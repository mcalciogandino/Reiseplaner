import { differenceInCalendarDays, parseISO } from "date-fns";
import type { Destination } from "./destinations";
import { formatDate } from "./trips";

type Range = { start_date: string; end_date: string };
export type Stop = Pick<Destination, "name" | "arrival_date" | "departure_date"> & { kind?: string | null };

const nights = (n: number) => (n === 1 ? "1 Nacht" : `${n} Nächte`);

/** Ortsarten, in denen man typischerweise übernachtet (Unterkünfte, Orte, Parks, Seen …). */
const LODGING = ["hotel", "motel", "hostel", "lodge", "bnb", "vacation_rental", "camping"];
const OVERNIGHT = [...LODGING, "city", "village", "national_park", "provincial_park", "lake", "beach", "mountain", "glacier", "other"];

/**
 * Ein Ort zählt als Aufenthalt, wenn seine Art zum Übernachten passt und er mindestens eine Nacht dauert.
 * Flughäfen, Mietwagenstationen, Ausflugsziele, Sehenswürdigkeiten und Tagesbesuche (Ankunft = Abreise)
 * sind keine Aufenthalte und verursachen keine Lücken oder Überschneidungen.
 */
export function isStay(s: Stop): s is Stop & { arrival_date: string; departure_date: string } {
  if (!s.arrival_date || !s.departure_date || s.departure_date <= s.arrival_date) return false;
  return !s.kind || OVERNIGHT.includes(s.kind);
}

export type StayConflict<T extends Stop> =
  | { type: "gap"; prev: T; next: T; nights: number }
  | { type: "overlap"; prev: T; next: T; nights: number };

const days = (from: string, to: string) => differenceInCalendarDays(parseISO(to), parseISO(from));

/**
 * Lücken und Überschneidungen der Aufenthalte in zeitlicher Reihenfolge (nicht in Routenreihenfolge).
 * Verglichen wird mit dem bisher am längsten dauernden Aufenthalt, damit ein einzelner langer Eintrag
 * nicht für jeden folgenden Ort eine Meldung erzeugt. Ein Ort, der vollständig in einem anderen liegt und
 * keine Unterkunft ist (z. B. Stadtbesuch während eines Campingaufenthalts), gilt als Ausflug.
 */
export function stayConflicts<T extends Stop>(stops: T[]): StayConflict<T>[] {
  const stays = stops
    .filter((s) => isStay(s))
    .sort((a, b) => a.arrival_date!.localeCompare(b.arrival_date!) || a.departure_date!.localeCompare(b.departure_date!));
  const out: StayConflict<T>[] = [];
  let anchor: T | null = null;
  for (const s of stays) {
    if (!anchor) {
      anchor = s;
      continue;
    }
    const contained = s.departure_date! <= anchor.departure_date!;
    if (contained && !(LODGING.includes(s.kind ?? "") && LODGING.includes(anchor.kind ?? ""))) continue;
    const gap = days(anchor.departure_date!, s.arrival_date!);
    if (gap > 0) out.push({ type: "gap", prev: anchor, next: s, nights: gap });
    else if (gap < 0) out.push({ type: "overlap", prev: anchor, next: s, nights: -gap });
    if (s.departure_date! > anchor.departure_date!) anchor = s;
  }
  return out;
}

/**
 * Prüft die Reiseorte auf Lücken, Überschneidungen und Daten ausserhalb der Reise.
 * Nur Aufenthalte (siehe isStay) zählen; die Reihenfolge ergibt sich aus den Daten.
 */
export function routeWarnings(trip: Range, stops: Stop[]): string[] {
  const warnings: string[] = [];

  for (const s of stops) {
    if (s.arrival_date && s.departure_date && (s.arrival_date < trip.start_date || s.departure_date > trip.end_date)) {
      warnings.push(
        `${s.name}: liegt ausserhalb der Reisedaten (${formatDate(trip.start_date)} – ${formatDate(trip.end_date)}).`,
      );
    }
  }

  for (const c of stayConflicts(stops)) {
    warnings.push(
      c.type === "gap"
        ? `Lücke: ${nights(c.nights)} ohne Ort zwischen ${c.prev.name} und ${c.next.name}.`
        : `Überschneidung: ${c.prev.name} und ${c.next.name} überlappen um ${nights(c.nights)}.`,
    );
  }

  const stays = stops.filter(isStay).sort((a, b) => a.arrival_date.localeCompare(b.arrival_date));
  if (stays.length > 0) {
    const first = stays[0];
    const last = stays.reduce((m, s) => (s.departure_date > m.departure_date ? s : m));
    const lead = days(trip.start_date, first.arrival_date);
    if (lead > 0) warnings.push(`Lücke: ${nights(lead)} zwischen Reisestart und ${first.name}.`);
    const tail = days(last.departure_date, trip.end_date);
    if (tail > 0) warnings.push(`Lücke: ${nights(tail)} zwischen ${last.name} und Reiseende.`);
  }
  return warnings;
}
