/**
 * Kopierlogik für Varianten: Aus einem Ausschnitt der Quell-Reise werden die Zeilen der neuen
 * Variante berechnet (neue IDs, umgebogene Verweise). Reine Funktion, damit sie sich ohne
 * Datenbank testen lässt.
 */

export const COPY_OPTIONS = [
  { key: "places", label: "Reiseorte", hint: "Orte mit Daten und Reihenfolge" },
  { key: "transfers", label: "Verschiebungen", hint: "Flüge, Fahrten, Fähren und gespeicherte Alternativen (braucht Reiseorte)" },
  { key: "lodging", label: "Unterkunftsdaten", hint: "Name, Adresse, Preis und Zeiten der Unterkünfte (braucht Reiseorte)" },
  { key: "vehicles", label: "Mietfahrzeuge", hint: "Autos und Camper" },
  { key: "days", label: "Tagesplan", hint: "Tage mit Programmpunkten" },
  { key: "budget", label: "Budget-Posten", hint: "Geplante und tatsächliche Beträge" },
  { key: "checklist", label: "Checkliste", hint: "Vorbereitung und Packliste" },
  { key: "bucket", label: "Bucket List mit Stimmen", hint: "Ideen samt Abstimmung" },
  { key: "booked", label: "Gebucht-Status und Buchungsnummern", hint: "Sonst startet die Variante ohne Buchungen" },
] as const;

export type CopyKey = (typeof COPY_OPTIONS)[number]["key"];
export type CopyOptions = Record<CopyKey, boolean>;

export const DEFAULT_COPY: CopyOptions = {
  places: true,
  transfers: true,
  lodging: true,
  vehicles: true,
  days: true,
  budget: true,
  checklist: true,
  bucket: true,
  booked: false,
};

/** Abhängigkeiten: Verschiebungen und Unterkünfte setzen Reiseorte voraus. */
export function normalizeOptions(o: CopyOptions): CopyOptions {
  if (o.places) return { ...o };
  return { ...o, transfers: false, lodging: false };
}

export type Row = Record<string, unknown>;

export type Snapshot = {
  trip: Row;
  destinations: Row[];
  transfers: Row[];
  vehicles: Row[];
  activities: Row[];
  activityVotes: Row[];
  dayPlans: Row[];
  dayPlanItems: Row[];
  budgetEntries: Row[];
  checklistItems: Row[];
};

export type VariantRows = {
  trip: Row;
  destinations: Row[];
  transfers: Row[];
  vehicles: Row[];
  activities: Row[];
  activityVotes: Row[];
  dayPlans: Row[];
  dayPlanItems: Row[];
  budgetEntries: Row[];
  checklistItems: Row[];
};

const LODGING_FIELDS = [
  "lodging_name",
  "lodging_address",
  "lodging_checkin",
  "lodging_checkout",
  "lodging_price",
  "lodging_currency",
  "lodging_booking_ref",
] as const;

const DROP = ["id", "created_at", "updated_at"] as const;

function strip(row: Row, extra: string[] = []): Row {
  const out: Row = { ...row };
  for (const k of [...DROP, ...extra]) delete out[k];
  return out;
}

export function remapTimelineKey(key: string, ids: Map<string, string>): string | null {
  const free = /^f-(.+)-(from|to)$/.exec(key);
  if (free) {
    const t = ids.get(free[1]);
    return t ? `f-${t}-${free[2]}` : null;
  }
  const m = /^([pt])-(.+)$/.exec(key);
  if (!m) return null;
  const n = ids.get(m[2]);
  return n ? `${m[1]}-${n}` : null;
}

export function planVariantCopy(
  src: Snapshot,
  rawOptions: CopyOptions,
  newTripId: string,
  variantName: string,
  ownerId: string,
  newId: () => string,
): VariantRows {
  const o = normalizeOptions(rawOptions);
  const rootId = (src.trip.variant_of as string | null) ?? (src.trip.id as string);

  const trip: Row = {
    ...strip(src.trip, ["variant_of", "variant_name", "timeline_order", "owner_id"]),
    id: newTripId,
    owner_id: ownerId,
    variant_of: rootId,
    variant_name: variantName,
    timeline_order: [],
  };

  const ids = new Map<string, string>(); // alte ID → neue ID (alle Tabellen; UUIDs kollidieren nicht)
  const take = (id: unknown) => {
    const n = newId();
    ids.set(String(id), n);
    return n;
  };
  const mapId = (id: unknown): string | null => (id == null ? null : (ids.get(String(id)) ?? null));

  const clearBooking = (r: Row, refFields: string[]) => {
    if (o.booked) return;
    r.booked = false;
    for (const f of refFields) r[f] = null;
  };

  const destinations = o.places
    ? src.destinations.map((d) => {
        const row: Row = { ...strip(d), id: take(d.id), trip_id: newTripId };
        if (!o.lodging) for (const f of LODGING_FIELDS) row[f] = null;
        clearBooking(row, ["lodging_booking_ref"]);
        if (!o.lodging) row.booked = false;
        return row;
      })
    : [];

  const groups = new Map<string, string>();
  const transfers = o.transfers
    ? src.transfers.map((t) => {
        const row: Row = { ...strip(t), id: take(t.id), trip_id: newTripId };
        row.from_destination_id = mapId(t.from_destination_id);
        row.to_destination_id = mapId(t.to_destination_id);
        row.document_id = null; // Dokumente gehören zur Quell-Reise
        if (t.option_group) {
          const g = String(t.option_group);
          if (!groups.has(g)) groups.set(g, newId());
          row.option_group = groups.get(g);
        }
        clearBooking(row, ["booking_ref"]);
        return row;
      })
    : [];

  const vehicles = o.vehicles
    ? src.vehicles.map((v) => {
        const row: Row = { ...strip(v), id: take(v.id), trip_id: newTripId };
        row.document_id = null;
        clearBooking(row, ["booking_ref"]);
        return row;
      })
    : [];

  const activities = o.bucket
    ? src.activities.map((a) => ({
        ...strip(a),
        id: take(a.id),
        trip_id: newTripId,
        destination_id: mapId(a.destination_id),
      }))
    : [];
  const activityVotes = o.bucket
    ? src.activityVotes
        .filter((v) => ids.has(String(v.activity_id)))
        .map((v) => ({ ...v, activity_id: mapId(v.activity_id) }))
    : [];

  const dayPlans = o.days
    ? src.dayPlans.map((d) => ({
        ...strip(d),
        id: take(d.id),
        trip_id: newTripId,
        destination_id: mapId(d.destination_id),
      }))
    : [];
  const dayPlanItems = o.days
    ? src.dayPlanItems
        .filter((i) => ids.has(String(i.day_plan_id)))
        .map((i) => ({
          ...strip(i),
          id: newId(),
          day_plan_id: mapId(i.day_plan_id),
          activity_id: mapId(i.activity_id),
          transfer_id: mapId(i.transfer_id),
        }))
    : [];

  const budgetEntries = o.budget
    ? src.budgetEntries.map((b) => ({
        ...strip(b),
        id: newId(),
        trip_id: newTripId,
        activity_id: mapId(b.activity_id),
        transfer_id: mapId(b.transfer_id),
        document_id: null,
      }))
    : [];

  const checklistItems = o.checklist
    ? src.checklistItems.map((c) => ({ ...strip(c), id: newId(), trip_id: newTripId }))
    : [];

  if (o.places) {
    const order = (src.trip.timeline_order as string[] | null) ?? [];
    trip.timeline_order = order.map((k) => remapTimelineKey(k, ids)).filter((k): k is string => k !== null);
  }

  return { trip, destinations, transfers, vehicles, activities, activityVotes, dayPlans, dayPlanItems, budgetEntries, checklistItems };
}

export function readCopyOptions(formData: FormData): CopyOptions {
  const o = { ...DEFAULT_COPY };
  for (const { key } of COPY_OPTIONS) o[key] = formData.get(`copy_${key}`) === "on";
  return normalizeOptions(o);
}

export function copySummary(o: CopyOptions): string {
  const on = COPY_OPTIONS.filter((c) => o[c.key]).map((c) => c.label);
  return on.length ? `Übernommen: ${on.join(", ")}` : "Leere Variante: es wird nichts übernommen.";
}
