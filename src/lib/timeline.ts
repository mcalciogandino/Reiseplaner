import type { Destination } from "./destinations";
import type { Transfer } from "./transfers";

export type TimelineNode =
  | { type: "place"; key: string; destination: Destination; dated: boolean }
  | { type: "free"; key: string; label: string }
  | { type: "transfer"; key: string; transfer: Transfer };

/** Rang bei gleicher Zeit: Abreiseort, freier Abfahrtsort, Verschiebung, freier Zielort, Zielort. */
const RANK = { fromPlace: 0, fromFree: 1, transfer: 2, toFree: 3, toPlace: 4 } as const;

type Entry = { time: number; rank: number; seq: number; node: TimelineNode };

const ms = (iso: string | null) => (iso ? Date.parse(iso) : NaN);
const dayStart = (date: string | null) => (date ? Date.parse(`${date}T00:00:00Z`) : NaN);

/**
 * Ordnet Reiseorte, Verschiebungen und freie Orte (Flughäfen, Hotels …) nach der Zeit.
 * - Ein Reiseort steht nach der Verschiebung, die dort ankommt, sonst vor der, die dort abfährt,
 *   sonst nach seinem Ankunftsdatum.
 * - Freie Orte stehen direkt vor bzw. nach «ihrer» Verschiebung; gleiche Namen direkt
 *   hintereinander erscheinen nur einmal.
 * - Ohne jede Zeitangabe bleibt die Reihenfolge der Route (bzw. Eingabe) erhalten: das Element
 *   folgt auf das vorherige Element seiner Art.
 */
export function buildTimeline(destinations: Destination[], transfers: Transfer[]): TimelineNode[] {
  const entries: Entry[] = [];
  let seq = 0;

  const arrivals = new Map<string, number>();
  const departures = new Map<string, number>();
  for (const t of transfers) {
    const arrive = ms(t.arrive_at);
    const depart = ms(t.depart_at);
    if (t.to_destination_id && !Number.isNaN(arrive ?? NaN)) {
      const cur = arrivals.get(t.to_destination_id);
      if (cur === undefined || arrive < cur) arrivals.set(t.to_destination_id, arrive);
    }
    if (t.from_destination_id && !Number.isNaN(depart)) {
      const cur = departures.get(t.from_destination_id);
      if (cur === undefined || depart < cur) departures.set(t.from_destination_id, depart);
    }
  }

  // Orte: Zeit bestimmen; Orte ohne Zeit folgen dem vorherigen Ort.
  let prevPlace = -Infinity;
  for (const d of destinations) {
    let time: number;
    let rank: number = RANK.toPlace;
    let dated = true;
    const a = arrivals.get(d.id);
    const dep = departures.get(d.id);
    const day = dayStart(d.arrival_date);
    if (a !== undefined) {
      time = a;
    } else if (dep !== undefined) {
      time = Number.isNaN(day) ? dep : Math.min(day, dep);
      rank = time === dep ? RANK.fromPlace : RANK.toPlace;
    } else if (!Number.isNaN(day)) {
      time = day;
    } else {
      time = prevPlace;
      dated = false;
    }
    if (time === -Infinity) time = -1e15; // ganz an den Anfang, aber in Eingabereihenfolge
    prevPlace = time;
    entries.push({ time, rank, seq: seq++, node: { type: "place", key: `p-${d.id}`, destination: d, dated } });
  }

  // Verschiebungen: ohne Zeit folgen sie der vorherigen Verschiebung (oder stehen am Ende).
  let prevTransfer = Infinity;
  for (const t of transfers) {
    const depart = ms(t.depart_at);
    const arrive = ms(t.arrive_at);
    const time = !Number.isNaN(depart) ? depart : !Number.isNaN(arrive) ? arrive : prevTransfer;
    prevTransfer = time;
    entries.push({ time, rank: RANK.transfer, seq: seq++, node: { type: "transfer", key: `t-${t.id}`, transfer: t } });
    if (t.from_place) {
      entries.push({ time, rank: RANK.fromFree, seq: seq++, node: { type: "free", key: `f-${t.id}-from`, label: t.from_place } });
    }
    if (t.to_place) {
      const at = !Number.isNaN(arrive) ? arrive : time;
      entries.push({ time: at, rank: RANK.toFree, seq: seq++, node: { type: "free", key: `f-${t.id}-to`, label: t.to_place } });
    }
  }

  entries.sort((x, y) => x.time - y.time || x.rank - y.rank || x.seq - y.seq);

  // Gleiche freie Orte direkt hintereinander nur einmal zeigen (z. B. Umstieg am selben Flughafen).
  const nodes: TimelineNode[] = [];
  for (const e of entries) {
    const prev = nodes[nodes.length - 1];
    if (
      e.node.type === "free" && prev?.type === "free" &&
      prev.label.trim().toLowerCase() === e.node.label.trim().toLowerCase()
    ) continue;
    nodes.push(e.node);
  }
  return nodes;
}

/**
 * Für den «+»-Knopf an Position `index` (zwischen Element index-1 und index):
 * vorheriger/nächster Reiseort und die Einfügeposition in der Routenreihenfolge.
 */
export function insertContext(nodes: TimelineNode[], index: number) {
  const places = (list: TimelineNode[]) =>
    list.flatMap((n) => (n.type === "place" ? [n.destination] : []));
  const before = places(nodes.slice(0, index));
  const after = places(nodes.slice(index));
  return {
    from: before.at(-1)?.id ?? null,
    to: after[0]?.id ?? null,
    /** Anzahl Reiseorte vor dieser Stelle = Einfügeindex in der Routenreihenfolge. */
    position: before.length,
  };
}
