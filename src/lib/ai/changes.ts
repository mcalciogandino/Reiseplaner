import { z } from "zod";
import type { Destination } from "../destinations";
import { KIND_LABELS, KINDS, localToUtcIso, utcToLocalInput, type Transfer } from "../transfers";

const date = z.iso.date();
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
const text = (max: number) => z.string().trim().max(max);
// Fehlt ein Feld, bleibt es unverändert; null leert es.
const opt = <T extends z.ZodType>(s: T) => s.nullable().optional();

export const setSchema = z.object({
  // Orte
  name: text(100).min(1).optional(),
  arrival_date: opt(date),
  departure_date: opt(date),
  lodging_name: opt(text(150)),
  lodging_checkin: opt(time),
  lodging_checkout: opt(time),
  lodging_price: opt(z.number().min(0).max(1_000_000)),
  lodging_currency: opt(z.string().trim().regex(/^[A-Za-z]{3}$/)),
  notes: opt(text(2000)),
  description: opt(text(2000)),
  // Verschiebungen
  kind: z.enum(KINDS as [string, ...string[]]).optional(),
  from_destination_id: opt(z.uuid()),
  to_destination_id: opt(z.uuid()),
  from_place: opt(text(150)),
  to_place: opt(text(150)),
  depart_local: opt(localDateTime),
  arrive_local: opt(localDateTime),
  carrier: opt(text(100)),
  flight_number: opt(text(30)),
  price: opt(z.number().min(0).max(1_000_000)),
  currency: opt(z.string().trim().regex(/^[A-Za-z]{3}$/)),
});

export const changeSchema = z.object({
  op: z.enum(["update_place", "delete_place", "update_transfer", "delete_transfer"]),
  id: z.uuid(),
  reason: text(300).nullish(),
  set: setSchema.nullish(),
});
export const changesSchema = z.array(changeSchema).max(40);
export type Change = z.infer<typeof changeSchema>;

/** Eine geprüfte Änderung: lesbare Vorher-Nachher-Zeilen und der Datenbank-Patch (nur erlaubte Spalten). */
export type ChangePreview = {
  op: Change["op"];
  id: string;
  title: string;
  reason: string | null;
  lines: string[];
  warnings: string[];
  patch: Record<string, unknown> | null;
};

export const PLACE_PATCH_KEYS = ["name", "arrival_date", "departure_date", "lodging_name", "lodging_checkin", "lodging_checkout", "lodging_price", "lodging_currency", "notes", "description"] as const;
export const TRANSFER_PATCH_KEYS = ["kind", "from_destination_id", "to_destination_id", "from_place", "to_place", "depart_at", "depart_tz", "arrive_at", "arrive_tz", "carrier", "flight_number", "price", "currency", "notes", "route_geojson", "route_distance_m", "route_duration_s"] as const;

const LABELS: Record<string, string> = {
  name: "Name", arrival_date: "Ankunft", departure_date: "Abreise", lodging_name: "Unterkunft", lodging_checkin: "Check-in",
  lodging_checkout: "Check-out", lodging_price: "Preis", lodging_currency: "Währung", notes: "Notizen", description: "Beschreibung",
  kind: "Art", from_destination_id: "Start", to_destination_id: "Ziel", from_place: "Start (frei)", to_place: "Ziel (frei)",
  depart_local: "Abfahrt", arrive_local: "Ankunft", carrier: "Anbieter", flight_number: "Flugnummer", price: "Preis", currency: "Währung",
};

const show = (v: unknown) => (v === null || v === undefined || v === "" ? "–" : String(v));
const hhmm = (v: unknown) => (typeof v === "string" ? v.slice(0, 5) : v);

function transferLabel(t: Transfer, name: (id: string | null, free: string | null) => string) {
  return `${KIND_LABELS[t.kind] ?? t.kind}: ${name(t.from_destination_id, t.from_place)} → ${name(t.to_destination_id, t.to_place)}`;
}

/**
 * Prüft die Änderungsvorschläge der KI gegen die Reise: unbekannte IDs entfallen, Daten und Zeiten werden
 * kontrolliert, und jede Änderung bekommt eine Vorher-Nachher-Ansicht. Nichts wird gespeichert.
 */
export function resolveChanges(changes: Change[], places: Destination[], transfers: Transfer[]): ChangePreview[] {
  const placeById = new Map(places.map((p) => [p.id, p]));
  const transferById = new Map(transfers.map((t) => [t.id, t]));
  const name = (id: string | null, free: string | null) => (id && placeById.get(id)?.name) || free || "?";
  const out: ChangePreview[] = [];
  const seen = new Set<string>();

  for (const c of changes) {
    const key = `${c.op.split("_")[1]}-${c.id}`;
    const del = c.op.startsWith("delete");
    if (seen.has(`${del}-${key}`)) continue;
    seen.add(`${del}-${key}`);
    const base = { op: c.op, id: c.id, reason: c.reason?.trim() || null, warnings: [] as string[] };

    if (c.op === "delete_place") {
      const p = placeById.get(c.id);
      if (!p) continue;
      const n = transfers.filter((t) => t.from_destination_id === c.id || t.to_destination_id === c.id).length;
      out.push({ ...base, title: `Ort löschen: ${p.name}`, lines: ["Wird gelöscht"], patch: null, warnings: n ? [`${n} Verschiebung(en) verlieren diesen Ort und bleiben ohne Start oder Ziel.`] : [] });
    } else if (c.op === "delete_transfer") {
      const t = transferById.get(c.id);
      if (!t) continue;
      out.push({ ...base, title: `Verschiebung löschen: ${transferLabel(t, name)}`, lines: ["Wird gelöscht"], patch: null });
    } else if (c.op === "update_place") {
      const p = placeById.get(c.id);
      if (!p || !c.set) continue;
      const patch: Record<string, unknown> = {};
      const lines: string[] = [];
      const warnings: string[] = [];
      for (const k of PLACE_PATCH_KEYS) {
        let v = (c.set as Record<string, unknown>)[k];
        if (v === undefined) continue;
        if (typeof v === "string" && v === "" && k !== "name") v = null;
        if (k === "lodging_currency" && typeof v === "string") v = v.toUpperCase();
        const before = (p as unknown as Record<string, unknown>)[k];
        const cmp = (x: unknown) => (k === "lodging_checkin" || k === "lodging_checkout" ? hhmm(x) : x);
        if (cmp(before) === cmp(v) || (before === null && v === null)) continue;
        patch[k] = v;
        lines.push(`${LABELS[k]}: ${show(cmp(before))} → ${show(v)}`);
      }
      const arr = (patch.arrival_date as string | null | undefined) ?? p.arrival_date;
      const dep = (patch.departure_date as string | null | undefined) ?? p.departure_date;
      if (arr && dep && dep < arr) {
        warnings.push("Die Abreise läge vor der Ankunft; die Änderung der Daten wird ausgelassen.");
        delete patch.arrival_date;
        delete patch.departure_date;
        for (let i = lines.length - 1; i >= 0; i--) if (/^(Ankunft|Abreise):/.test(lines[i])) lines.splice(i, 1);
      }
      if (!Object.keys(patch).length) continue;
      out.push({ ...base, title: `Ort ändern: ${p.name}`, lines, warnings, patch });
    } else {
      const t = transferById.get(c.id);
      if (!t || !c.set) continue;
      const s = c.set as Record<string, unknown>;
      const patch: Record<string, unknown> = {};
      const lines: string[] = [];
      const warnings: string[] = [];
      const simple = ["kind", "from_place", "to_place", "carrier", "flight_number", "price", "currency", "notes"] as const;
      for (const k of simple) {
        let v = s[k];
        if (v === undefined) continue;
        if (typeof v === "string" && v === "") v = null;
        if (k === "currency" && typeof v === "string") v = v.toUpperCase();
        if (k === "kind" && v === null) continue;
        const before = (t as unknown as Record<string, unknown>)[k];
        if (before === v) continue;
        patch[k] = v;
        lines.push(`${LABELS[k]}: ${k === "kind" ? KIND_LABELS[before as Transfer["kind"]] : show(before)} → ${k === "kind" ? KIND_LABELS[v as Transfer["kind"]] : show(v)}`);
      }
      let endpointChanged = false;
      for (const k of ["from_destination_id", "to_destination_id"] as const) {
        const v = s[k];
        if (v === undefined || v === t[k]) continue;
        if (v !== null && !placeById.has(v as string)) {
          warnings.push("Ein genannter Ort existiert nicht; diese Änderung entfällt.");
          continue;
        }
        patch[k] = v;
        endpointChanged = true;
        lines.push(`${LABELS[k]}: ${name(t[k], null)} → ${v ? name(v as string, null) : "–"}`);
      }
      const tzFor = (current: string | null, placeId: string | null) => current ?? (placeId ? placeById.get(placeId)?.timezone ?? null : null);
      const fromId = (patch.from_destination_id as string | null | undefined) ?? t.from_destination_id;
      const toId = (patch.to_destination_id as string | null | undefined) ?? t.to_destination_id;
      for (const [k, at, tz, cur, curTz, pid] of [
        ["depart_local", "depart_at", "depart_tz", t.depart_at, t.depart_tz, fromId],
        ["arrive_local", "arrive_at", "arrive_tz", t.arrive_at, t.arrive_tz, toId],
      ] as const) {
        const v = s[k];
        if (v === undefined) continue;
        const zone = tzFor(curTz, pid);
        const beforeLocal = cur && zone ? utcToLocalInput(cur, zone) : cur;
        if (v === null) {
          if (cur === null) continue;
          patch[at] = null;
          patch[tz] = null;
          lines.push(`${LABELS[k]}: ${show(beforeLocal?.replace("T", " "))} → –`);
          continue;
        }
        if (!zone) {
          warnings.push(`${LABELS[k]}: Zeitzone unbekannt, die Uhrzeit wird nicht übernommen.`);
          continue;
        }
        const iso = localToUtcIso(v as string, zone);
        if (iso === cur) continue;
        patch[at] = iso;
        patch[tz] = zone;
        lines.push(`${LABELS[k]}: ${show(beforeLocal?.replace("T", " "))} → ${(v as string).replace("T", " ")}`);
      }
      const dep = (patch.depart_at as string | null | undefined) ?? t.depart_at;
      const arr = (patch.arrive_at as string | null | undefined) ?? t.arrive_at;
      if (dep && arr && arr < dep) {
        warnings.push("Die Ankunft läge vor der Abfahrt; die Zeiten werden nicht übernommen.");
        for (const k of ["depart_at", "depart_tz", "arrive_at", "arrive_tz"]) delete patch[k];
        for (let i = lines.length - 1; i >= 0; i--) if (/^(Abfahrt|Ankunft):/.test(lines[i])) lines.splice(i, 1);
      }
      if (endpointChanged) Object.assign(patch, { route_geojson: null, route_distance_m: null, route_duration_s: null });
      if (!lines.length) continue;
      out.push({ ...base, title: `Verschiebung ändern: ${transferLabel(t, name)}`, lines, warnings, patch });
    }
  }
  return out;
}
