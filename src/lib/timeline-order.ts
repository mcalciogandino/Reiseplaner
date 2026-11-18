import type { Destination } from "./destinations";
import { utcToLocalInput, type Transfer } from "./transfers";

type P = Pick<Destination, "id" | "arrival_date">;
type T = Pick<Transfer, "id" | "from_destination_id" | "to_destination_id" | "depart_at" | "depart_tz" | "arrive_at" | "arrive_tz">;

function day(iso: string | null, tz: string | null): string | null {
  if (!iso) return null;
  try {
    return (tz ? utcToLocalInput(iso, tz) : iso).slice(0, 10);
  } catch {
    return iso.slice(0, 10);
  }
}

const departKey = (t: T) => t.depart_at ?? t.arrive_at ?? "";

/**
 * Logische Reihenfolge der Zeitleiste: Orte nach Datum (Orte ohne Datum bleiben hinter ihrem Vorgänger in der Route),
 * dazwischen die Verschiebungen: eine Verschiebung steht direkt vor ihrem Zielort, eine ohne Zielort direkt nach ihrem
 * Startort. Verschiebungen ohne Bezug zu einem Ort kommen nach Datum an die passende Stelle.
 * Erwartet die Orte in Routenreihenfolge und nur gewählte Verbindungen (keine Alternativen).
 * Liefert die Schlüssel `p-<id>` / `t-<id>`.
 */
export function logicalOrder(destinations: P[], transfers: T[]): string[] {
  const arrivalDay = new Map<string, string>();
  for (const t of transfers) {
    const d = day(t.arrive_at, t.arrive_tz);
    if (t.to_destination_id && d && (!arrivalDay.has(t.to_destination_id) || d < arrivalDay.get(t.to_destination_id)!)) {
      arrivalDay.set(t.to_destination_id, d);
    }
  }
  let carry = "";
  const keyed = destinations.map((d, i) => {
    carry = d.arrival_date ?? arrivalDay.get(d.id) ?? carry;
    return { d, i, key: carry };
  });
  const places = [...keyed].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.i - b.i)).map((k) => k.d);
  const pos = new Map(places.map((p, i) => [p.id, i]));

  const before: T[][] = places.map(() => []);
  const after: T[][] = places.map(() => []);
  const loose: T[] = [];
  for (const t of transfers) {
    const to = t.to_destination_id ? pos.get(t.to_destination_id) : undefined;
    const from = t.from_destination_id ? pos.get(t.from_destination_id) : undefined;
    if (to !== undefined) before[to].push(t);
    else if (from !== undefined) after[from].push(t);
    else loose.push(t);
  }
  const byTime = (a: T, b: T) => (departKey(a) < departKey(b) ? -1 : departKey(a) > departKey(b) ? 1 : 0);

  const out: { key: string; day: string | null }[] = [];
  places.forEach((p, i) => {
    for (const t of before[i].sort(byTime)) out.push({ key: `t-${t.id}`, day: day(t.depart_at, t.depart_tz) });
    out.push({ key: `p-${p.id}`, day: p.arrival_date ?? arrivalDay.get(p.id) ?? null });
    for (const t of after[i].sort(byTime)) out.push({ key: `t-${t.id}`, day: day(t.depart_at, t.depart_tz) });
  });
  for (const t of loose.sort(byTime)) {
    const d = day(t.depart_at, t.depart_tz) ?? day(t.arrive_at, t.arrive_tz);
    const at = d ? out.findIndex((o) => o.day !== null && o.day > d) : -1;
    out.splice(at < 0 ? out.length : at, 0, { key: `t-${t.id}`, day: d });
  }
  return out.map((o) => o.key);
}

/**
 * Ergänzt eine von Hand festgelegte Reihenfolge um neue Einträge: jeder neue Schlüssel kommt hinter den
 * Vorgänger, den er in der logischen Reihenfolge hat; ohne Vorgänger an den Anfang. Bestehendes bleibt unberührt.
 */
export function mergeIntoOrder(existing: string[], logical: string[], isNew: (key: string) => boolean): string[] {
  const out = existing.filter((k) => logical.includes(k));
  logical.forEach((k, i) => {
    if (!isNew(k) || out.includes(k)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const idx = out.indexOf(logical[j]);
      if (idx >= 0) {
        at = idx + 1;
        break;
      }
    }
    out.splice(at, 0, k);
  });
  return out;
}
