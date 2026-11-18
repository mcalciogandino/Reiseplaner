import type { Destination } from "./destinations";
import { utcToLocalInput, type Transfer } from "./transfers";
import { logicalOrder } from "./timeline-order";

export type Fix =
  | { kind: "merge"; keep: string; remove: string }
  | { kind: "add_transfer"; from: string; to: string }
  | { kind: "set_transfer_from"; transfer: string; from: string }
  | { kind: "set_place_arrival"; place: string; date: string };

export type Finding = {
  id: string;
  severity: "error" | "warning";
  title: string;
  detail: string;
  /** Automatische Korrektur, falls eindeutig. */
  fix?: { label: string; fix: Fix };
  /** Vorschlag für eine Frage an die KI, wenn es nur Menschen oder KI entscheiden können. */
  ask?: string;
};

type D = Pick<Destination, "id" | "name" | "arrival_date" | "departure_date" | "lat" | "lng" | "lodging_name" | "lodging_price" | "lodging_booking_ref" | "booked">;
type T = Pick<Transfer, "id" | "kind" | "from_destination_id" | "to_destination_id" | "from_place" | "to_place" | "depart_at" | "depart_tz" | "arrive_at" | "arrive_tz">;

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim();

function sameThing(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [s, l] = x.length <= y.length ? [x, y] : [y, x];
  return s.length >= 6 && (l.startsWith(`${s} `) || l.endsWith(` ${s}`) || l.includes(` ${s} `));
}

const daysOf = (d: Pick<D, "arrival_date" | "departure_date">): [string, string] | null => {
  const a = d.arrival_date ?? d.departure_date;
  const b = d.departure_date ?? d.arrival_date;
  return a && b ? [a, b] : null;
};
const overlapDays = (x: [string, string], y: [string, string]) => {
  const start = x[0] > y[0] ? x[0] : y[0];
  const end = x[1] < y[1] ? x[1] : y[1];
  return start <= end ? Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) : -1;
};
const completeness = (d: D) =>
  [d.lat !== null, d.lodging_name, d.lodging_price !== null, d.lodging_booking_ref, d.booked, d.arrival_date, d.departure_date].filter(Boolean).length;

function localDay(iso: string | null, tz: string | null): string | null {
  if (!iso) return null;
  try {
    return (tz ? utcToLocalInput(iso, tz) : iso).slice(0, 10);
  } catch {
    return iso.slice(0, 10);
  }
}

/**
 * Prüft den Plan regelbasiert (ohne KI) auf Doppelte, Überschneidungen und Lücken.
 * `trip` begrenzt den Zeitraum. Erwartet die Orte in Routenreihenfolge und nur gewählte Verbindungen.
 */
export function checkPlan(trip: { start_date: string; end_date: string }, places: D[], transfers: T[]): Finding[] {
  const out: Finding[] = [];
  const byId = new Map(places.map((p) => [p.id, p]));
  const name = (id: string | null, free: string | null) => (id && byId.get(id)?.name) || free || "?";

  // 1. Doppelte Orte
  const merged = new Set<string>();
  for (let i = 0; i < places.length; i++) {
    for (let j = i + 1; j < places.length; j++) {
      const a = places[i];
      const b = places[j];
      if (merged.has(a.id) || merged.has(b.id) || !sameThing(a.name, b.name)) continue;
      const da = daysOf(a);
      const db = daysOf(b);
      if (da && db && overlapDays(da, db) < 0) continue; // gleicher Name, aber andere Zeit: z. B. Hin- und Rückweg
      const [keep, remove] = completeness(a) >= completeness(b) ? [a, b] : [b, a];
      merged.add(remove.id);
      out.push({
        id: `dup-${keep.id}-${remove.id}`,
        severity: "error",
        title: `Doppelter Ort: «${a.name}» und «${b.name}»`,
        detail: "Beide stehen zur selben Zeit in der Route. Zusammenführen behält die vollständigeren Angaben und biegt die Verschiebungen um.",
        fix: { label: `«${remove.name}» in «${keep.name}» zusammenführen`, fix: { kind: "merge", keep: keep.id, remove: remove.id } },
      });
    }
  }

  const live = places.filter((p) => !merged.has(p.id));
  const order = logicalOrder(live, transfers).filter((k) => k.startsWith("p-")).map((k) => byId.get(k.slice(2))!);
  const prevOf = new Map(order.map((p, i) => [p.id, order[i - 1]]));

  // 2. Überschneidungen zwischen aufeinanderfolgenden Orten (mehr als eine Nacht)
  for (let i = 1; i < order.length; i++) {
    const a = order[i - 1];
    const b = order[i];
    const da = daysOf(a);
    const db = daysOf(b);
    if (da && db && overlapDays(da, db) > 1) {
      out.push({
        id: `overlap-${a.id}-${b.id}`,
        severity: "warning",
        title: `Zeiten überschneiden sich: «${a.name}» und «${b.name}»`,
        detail: `${da[0]} – ${da[1]} und ${db[0]} – ${db[1]} liegen mehr als eine Nacht übereinander.`,
        ask: `«${a.name}» (${da[0]} bis ${da[1]}) und «${b.name}» (${db[0]} bis ${db[1]}) überschneiden sich. Bitte schlage Änderungen der Daten vor, damit die Route aufgeht.`,
      });
    }
  }

  // 3. Orte ausserhalb des Reisezeitraums
  for (const p of live) {
    const d = daysOf(p);
    if (d && (d[0] < trip.start_date || d[1] > trip.end_date)) {
      out.push({
        id: `range-${p.id}`,
        severity: "warning",
        title: `«${p.name}» liegt ausserhalb der Reise`,
        detail: `Die Reise dauert ${trip.start_date} – ${trip.end_date}, der Ort ${d[0]} – ${d[1]}.`,
        ask: `«${p.name}» liegt ausserhalb des Reisezeitraums. Bitte korrigiere die Daten oder schlage vor, den Ort zu löschen.`,
      });
    }
  }

  // 4. Lücken: aufeinanderfolgende Orte ohne Verschiebung dazwischen
  for (let i = 1; i < order.length; i++) {
    const a = order[i - 1];
    const b = order[i];
    const connected = transfers.some((t) => t.to_destination_id === b.id || (t.from_destination_id === a.id && !t.to_destination_id));
    const reverse = transfers.some((t) => t.from_destination_id === b.id && t.to_destination_id === a.id);
    if (!connected && !reverse) {
      out.push({
        id: `gap-${a.id}-${b.id}`,
        severity: "warning",
        title: `Keine Verschiebung von «${a.name}» nach «${b.name}»`,
        detail: "Zwischen diesen beiden Orten fehlt die Fahrt oder der Flug.",
        fix: { label: "Autofahrt ergänzen", fix: { kind: "add_transfer", from: a.id, to: b.id } },
      });
    }
  }

  // 5. Verschiebung beginnt nicht beim vorherigen Ort
  for (const t of transfers) {
    const to = t.to_destination_id ? byId.get(t.to_destination_id) : undefined;
    if (!to || !t.from_destination_id || merged.has(to.id)) continue;
    const prev = prevOf.get(to.id);
    const from = byId.get(t.from_destination_id);
    if (!prev || !from || prev.id === from.id) continue;
    // Nur auffällig, wenn der Startort weit weg in der Route steht (kein Nachbar, kein Rückweg zum Nachbarn).
    const gap = Math.abs(order.findIndex((p) => p.id === from.id) - order.findIndex((p) => p.id === to.id));
    if (gap > 1) {
      out.push({
        id: `from-${t.id}`,
        severity: "warning",
        title: `Start passt nicht zur Route: «${from.name}» → «${to.name}»`,
        detail: `Davor steht in der Route «${prev.name}».`,
        fix: { label: `Start auf «${prev.name}» setzen`, fix: { kind: "set_transfer_from", transfer: t.id, from: prev.id } },
      });
    }
  }

  // 6. Ankunftsdatum der Verschiebung und des Ortes widersprechen sich
  for (const t of transfers) {
    const to = t.to_destination_id ? byId.get(t.to_destination_id) : undefined;
    const day = localDay(t.arrive_at, t.arrive_tz);
    if (to && day && to.arrival_date && to.arrival_date !== day && !merged.has(to.id)) {
      out.push({
        id: `arrive-${t.id}`,
        severity: "warning",
        title: `Ankunftsdatum widerspricht: «${to.name}»`,
        detail: `Die Verschiebung kommt am ${day} an, der Ort beginnt am ${to.arrival_date}.`,
        fix: { label: `Ankunft des Ortes auf ${day} setzen`, fix: { kind: "set_place_arrival", place: to.id, date: day } },
      });
    }
  }

  // 7. Verschiebungen ohne Start oder Ziel
  for (const t of transfers) {
    const from = name(t.from_destination_id, t.from_place);
    const to = name(t.to_destination_id, t.to_place);
    if (from === "?" || to === "?") {
      out.push({
        id: `open-${t.id}`,
        severity: "warning",
        title: "Verschiebung ohne Start oder Ziel",
        detail: `${from} → ${to}`,
        ask: `Eine Verschiebung hat keinen ${from === "?" ? "Start" : "Ziel"} (${from} → ${to}). Bitte ergänze ihn oder schlage vor, sie zu löschen.`,
      });
    }
  }

  return out;
}
