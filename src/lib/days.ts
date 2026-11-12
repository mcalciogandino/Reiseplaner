import { utcToLocalInput } from "./transfers";

export type DayItem = {
  id: string;
  title: string;
  description: string | null;
  start_time: string | null; // HH:MM:SS
  end_time: string | null;
  plan_b: boolean;
  sort_order: number;
};

/** Alle Kalendertage von start bis end (einschliesslich), als YYYY-MM-DD. */
export function eachDate(start: string, end: string): string[] {
  const out: string[] = [];
  const last = Date.parse(`${end}T00:00:00Z`);
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= last && out.length < 400; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/** Orte, an denen man sich an diesem Tag aufhält (Ankunft bis Abreise; ohne Abreise nur der Ankunftstag). */
export function placesOnDay<T extends { arrival_date: string | null; departure_date: string | null }>(
  places: T[],
  date: string,
): T[] {
  return places.filter((p) => {
    if (!p.arrival_date) return false;
    return date >= p.arrival_date && date <= (p.departure_date ?? p.arrival_date);
  });
}

/** Verschiebungen, die an diesem Tag (Ortszeit am Abfahrtsort) beginnen. */
export function transfersOnDay<T extends { depart_at: string | null; depart_tz: string | null }>(
  transfers: T[],
  date: string,
): T[] {
  return transfers.filter(
    (t) => t.depart_at && utcToLocalInput(t.depart_at, t.depart_tz ?? "UTC").slice(0, 10) === date,
  );
}

const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Dauer der Programmpunkte in Minuten (nur mit Start und Ende; Plan B zählt nicht). */
export function programMinutes(items: Pick<DayItem, "start_time" | "end_time" | "plan_b">[]): number {
  return items.reduce(
    (sum, i) => (i.plan_b || !i.start_time || !i.end_time ? sum : sum + Math.max(0, minutes(i.end_time) - minutes(i.start_time))),
    0,
  );
}

/** Hinweise zur Tageslast: lange Fahrzeit oder ein überfüllter Tag. */
export function dayWarnings(travelMin: number, programMin: number): string[] {
  const out: string[] = [];
  if (travelMin > 6 * 60) out.push("Sehr lange Reisezeit an diesem Tag. Plane wenig anderes ein.");
  if (travelMin + programMin > 12 * 60) out.push("Reisezeit und Programm ergeben mehr als 12 Stunden. Plane Puffer ein.");
  return out;
}
