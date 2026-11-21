/**
 * Kennzahlen für die Statistik-Seite einer Reise. Reine Funktionen auf einfachen Zeilen,
 * damit sie sich ohne Datenbank testen lassen.
 */
import { TZDate } from "@date-fns/tz";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { PLACE_KIND_LABELS } from "./destinations";
import { driveKm, driveMinutes } from "./transfers";
import { tripDays } from "./trips";
import { STATUSES, PRIORITIES, type Priority, type Status } from "./activities";

export type StatDestination = {
  id?: string;
  name?: string;
  kind: string;
  arrival_date: string | null;
  departure_date: string | null;
  addr_region: string | null;
  booked: boolean;
  lodging_name: string | null;
};

export type StatDrive = {
  depart_at: string | null;
  depart_tz: string | null;
  distance_km: number | null;
  route_distance_m: number | null;
  duration_min: number | null;
  route_duration_s: number | null;
};

/** Nächte eines Aufenthalts; ohne Ankunft oder Abreise 0. */
export function nightsOf(d: Pick<StatDestination, "arrival_date" | "departure_date">): number {
  if (!d.arrival_date || !d.departure_date) return 0;
  return Math.max(0, differenceInCalendarDays(parseISO(d.departure_date), parseISO(d.arrival_date)));
}

const regionKey = (r: string) => r.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

export type Overview = { days: number; nights: number; places: number; overnightPlaces: number; regions: string[] };

export function overview(trip: { start_date: string; end_date: string }, dests: StatDestination[]): Overview {
  const days = tripDays(trip.start_date, trip.end_date);
  const seen = new Map<string, string>();
  for (const d of dests) {
    const r = d.addr_region?.trim();
    if (r && !seen.has(regionKey(r))) seen.set(regionKey(r), r);
  }
  return {
    days,
    nights: Math.max(0, days - 1),
    places: dests.length,
    overnightPlaces: dests.filter((d) => nightsOf(d) >= 1).length,
    regions: [...seen.values()].sort((a, b) => a.localeCompare(b, "de")),
  };
}

export type DriveDay = { date: string; km: number; minutes: number };
export type DriveStats = {
  count: number;
  totalKm: number;
  totalMinutes: number;
  /** Fahrten ohne Abfahrtszeit: zählen in den Summen, aber in keinem Fahrtag. */
  undated: number;
  driveDays: number;
  /** Tage mit Fahrten, die zusammen eine Strecke ergeben; nur diese sind vergleichbar. */
  longest: DriveDay | null;
  shortest: DriveDay | null;
  avgKmPerDriveDay: number | null;
  restDays: number;
};

/** Datum (yyyy-MM-dd) einer Abfahrt in der Ortszeit; ohne Zeitzone in UTC. */
export function localDay(iso: string, tz: string | null): string {
  try {
    return format(tz ? new TZDate(parseISO(iso), tz) : parseISO(iso), "yyyy-MM-dd");
  } catch {
    return iso.slice(0, 10);
  }
}

export function driveStats(drives: StatDrive[], dests: StatDestination[]): DriveStats {
  const perDay = new Map<string, DriveDay>();
  let totalKm = 0;
  let totalMinutes = 0;
  let undated = 0;
  for (const t of drives) {
    const km = driveKm(t) ?? 0;
    const min = driveMinutes(t) ?? 0;
    totalKm += km;
    totalMinutes += min;
    if (!t.depart_at) {
      undated += 1;
      continue;
    }
    const date = localDay(t.depart_at, t.depart_tz);
    const day = perDay.get(date) ?? { date, km: 0, minutes: 0 };
    day.km += km;
    day.minutes += min;
    perDay.set(date, day);
  }
  const days = [...perDay.values()];
  const comparable = days.filter((d) => d.km > 0);
  const longest = comparable.reduce<DriveDay | null>((a, d) => (!a || d.km > a.km ? d : a), null);
  const shortest = comparable.reduce<DriveDay | null>((a, d) => (!a || d.km < a.km ? d : a), null);
  const datedKm = days.reduce((a, d) => a + d.km, 0);

  // Ruhetage: Tage mitten in einem Aufenthalt von mindestens 2 Nächten, an denen nicht gefahren wird.
  const rest = new Set<string>();
  for (const d of dests) {
    if (nightsOf(d) < 2 || !d.arrival_date) continue;
    for (let i = 1; i < nightsOf(d); i++) {
      const day = format(addDays(parseISO(d.arrival_date), i), "yyyy-MM-dd");
      if (!perDay.has(day)) rest.add(day);
    }
  }

  return {
    count: drives.length,
    totalKm,
    totalMinutes,
    undated,
    driveDays: days.length,
    longest,
    shortest,
    avgKmPerDriveDay: days.length ? Math.round(datedKm / days.length) : null,
    restDays: rest.size,
  };
}

export type KindNights = { kind: string; label: string; nights: number };
export type LodgingStats = { nightsByKind: KindNights[]; totalNights: number; booked: number; open: number };

/** Unterkünfte = Orte mit mindestens einer Nacht oder mit Unterkunftsangabe. */
export function lodgingStats(dests: StatDestination[]): LodgingStats {
  const byKind = new Map<string, number>();
  let booked = 0;
  let open = 0;
  for (const d of dests) {
    const nights = nightsOf(d);
    if (nights >= 1) byKind.set(d.kind, (byKind.get(d.kind) ?? 0) + nights);
    if (nights >= 1 || d.lodging_name) {
      if (d.booked) booked += 1;
      else open += 1;
    }
  }
  const nightsByKind = [...byKind.entries()]
    .map(([kind, nights]) => ({ kind, label: (PLACE_KIND_LABELS as Record<string, string>)[kind] ?? kind, nights }))
    .sort((a, b) => b.nights - a.nights || a.label.localeCompare(b.label, "de"));
  return { nightsByKind, totalNights: nightsByKind.reduce((a, k) => a + k.nights, 0), booked, open };
}

export type ActivityStats = {
  total: number;
  byStatus: { status: Status; count: number }[];
  byPriority: { priority: Priority; count: number }[];
  /** Orte mit den meisten Aktivitäten (ohne Verworfene). */
  topPlaces: { name: string; count: number }[];
};

/** Aktivitäten haben keine Kategorie; ausgewertet werden Status, Wichtigkeit und Ort. */
export function activityStats(
  acts: { status: string; priority: string; destination_id: string | null }[],
  placeNames: Map<string, string>,
  topN = 5,
): ActivityStats {
  const places = new Map<string, number>();
  for (const a of acts) {
    if (a.status === "dropped" || !a.destination_id) continue;
    const name = placeNames.get(a.destination_id);
    if (name) places.set(name, (places.get(name) ?? 0) + 1);
  }
  return {
    total: acts.length,
    byStatus: STATUSES.map((status) => ({ status, count: acts.filter((a) => a.status === status).length })),
    byPriority: PRIORITIES.map((priority) => ({ priority, count: acts.filter((a) => a.priority === priority).length })),
    topPlaces: [...places.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "de"))
      .slice(0, topN),
  };
}

export type ReviewRow = { label: string; reviewed: number; open: number };
export type ReviewStats = { rows: ReviewRow[]; reviewed: number; open: number; share: number | null };

/** Geprüfte und offene KI-Einträge (`reviewed`) je Tabelle; Tabellen ohne Zeilen entfallen. */
export function reviewStats(tables: { label: string; rows: { reviewed: boolean | null }[] }[]): ReviewStats {
  const rows = tables
    .map((t) => ({
      label: t.label,
      reviewed: t.rows.filter((r) => r.reviewed !== false).length,
      open: t.rows.filter((r) => r.reviewed === false).length,
    }))
    .filter((r) => r.reviewed + r.open > 0);
  const reviewed = rows.reduce((a, r) => a + r.reviewed, 0);
  const open = rows.reduce((a, r) => a + r.open, 0);
  return { rows, reviewed, open, share: reviewed + open > 0 ? reviewed / (reviewed + open) : null };
}
