"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isValidCoord, roundCoord } from "@/lib/geocode";
import { fetchRoute } from "@/lib/route-service";
import { ROUTABLE_KINDS } from "@/lib/routing";
import { isValidTimeZone } from "@/lib/timezone";
import { locationSchema, NEW_PLACE, NEW_PLACE_KEYS, newPlaceBaseSchema } from "@/lib/place-fields";
import { KINDS, localToUtcIso, TRANSFER_COLUMNS, type Transfer } from "@/lib/transfers";

export type TransferFormState = {
  message: string;
  values: Record<string, string>;
} | null;

const FIELDS = [
  "kind", "from_destination_id", "to_destination_id", "from_place", "to_place",
  "depart_local", "depart_tz", "arrive_local", "arrive_tz",
  "duration_min", "distance_km", "carrier", "flight_number", "booking_ref",
  "from_lat", "from_lng", "to_lat", "to_lng",
  ...(["from", "to"] as const).flatMap((side) => NEW_PLACE_KEYS.map((k) => `${side}_new_${k}`)),
];

const text = (max: number) =>
  z.string().trim().max(max, `Maximal ${max} Zeichen.`).transform((v) => v || null);
const optUuid = z.union([z.literal(""), z.uuid()]).transform((v) => v || null);
const optInt = (label: string) =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === "") return null;
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || n > 100000) {
        ctx.addIssue({ code: "custom", message: `${label}: bitte eine ganze Zahl eingeben.` });
        return z.NEVER;
      }
      return n;
    });
const localDateTime = z.union([
  z.literal(""),
  z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Bitte Datum und Uhrzeit wählen."),
]);

const schema = z
  .object({
    kind: z.enum(KINDS as [string, ...string[]], "Bitte eine Art wählen."),
    from_destination_id: optUuid,
    to_destination_id: optUuid,
    from_place: text(150),
    to_place: text(150),
    depart_local: localDateTime,
    depart_tz: z.string(),
    arrive_local: localDateTime,
    arrive_tz: z.string(),
    duration_min: optInt("Dauer"),
    distance_km: optInt("Distanz"),
    carrier: text(100),
    flight_number: text(30),
    booking_ref: text(100),
    from_lat: z.string().trim(),
    from_lng: z.string().trim(),
    to_lat: z.string().trim(),
    to_lng: z.string().trim(),
  })
  .superRefine((d, ctx) => {
    for (const [local, tz, label] of [
      [d.depart_local, d.depart_tz, "Abfahrt"],
      [d.arrive_local, d.arrive_tz, "Ankunft"],
    ] as const) {
      if (local && !isValidTimeZone(tz)) {
        ctx.addIssue({ code: "custom", message: `${label}: bitte eine Zeitzone wählen.` });
      }
    }
  })
  .superRefine((d, ctx) => {
    for (const [lat, lng] of [[d.from_lat, d.from_lng], [d.to_lat, d.to_lng]] as const) {
      if ((lat === "") !== (lng === "") || (lat !== "" && !isValidCoord(Number(lat), Number(lng)))) {
        ctx.addIssue({ code: "custom", message: "Der Standort ist unvollständig. Bitte neu suchen." });
      }
    }
  })
  .transform((d) => ({
    kind: d.kind,
    from_destination_id: d.from_destination_id,
    to_destination_id: d.to_destination_id,
    from_place: d.from_place,
    to_place: d.to_place,
    // Koordinaten gelten nur für freie Orte (ohne Reiseort) mit Namen.
    from_lat: d.from_place && !d.from_destination_id && d.from_lat !== "" ? roundCoord(Number(d.from_lat)) : null,
    from_lng: d.from_place && !d.from_destination_id && d.from_lng !== "" ? roundCoord(Number(d.from_lng)) : null,
    to_lat: d.to_place && !d.to_destination_id && d.to_lat !== "" ? roundCoord(Number(d.to_lat)) : null,
    to_lng: d.to_place && !d.to_destination_id && d.to_lng !== "" ? roundCoord(Number(d.to_lng)) : null,
    depart_at: d.depart_local ? localToUtcIso(d.depart_local, d.depart_tz) : null,
    depart_tz: d.depart_local ? d.depart_tz : null,
    arrive_at: d.arrive_local ? localToUtcIso(d.arrive_local, d.arrive_tz) : null,
    arrive_tz: d.arrive_local ? d.arrive_tz : null,
    duration_min: d.duration_min,
    distance_km: d.distance_km,
    carrier: d.carrier,
    flight_number: d.flight_number,
    booking_ref: d.booking_ref,
  }))
  .refine((d) => !d.depart_at || !d.arrive_at || d.arrive_at >= d.depart_at, {
    message: "Die Ankunft darf nicht vor der Abfahrt liegen.",
    path: ["arrive_local"],
  });

const uuid = z.uuid();

function read(formData: FormData) {
  return Object.fromEntries(FIELDS.map((k) => [k, String(formData.get(k) ?? "")]));
}

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Side = "from" | "to";

/** Prüft die Angaben eines neuen Ortes; gibt die Zeile oder eine Fehlermeldung zurück. */
function parseNewPlace(values: Record<string, string>, side: Side) {
  const get = (k: string) => values[`${side}_new_${k}`] ?? "";
  const base = newPlaceBaseSchema.safeParse({
    name: get("name"), kind: get("kind") || "city", timezone: get("timezone"), lodging_name: get("lodging_name"),
  });
  if (!base.success) return { error: base.error.issues[0].message };
  const loc = locationSchema.safeParse(
    Object.fromEntries(NEW_PLACE_KEYS.filter((k) => !["name", "kind", "timezone", "lodging_name"].includes(k)).map((k) => [k, get(k)])),
  );
  if (!loc.success) return { error: loc.error.issues[0].message };
  return { row: { ...base.data, ...loc.data } };
}

/**
 * Legt die neuen Orte an (Auswahl «Neuer Ort anlegen …») und liefert deren IDs.
 * Ankunft bzw. Abreise des Ortes werden aus der Verschiebung übernommen.
 */
async function createNewPlaces(
  supabase: Supabase,
  tripId: string,
  values: Record<string, string>,
  rows: Partial<Record<Side, NonNullable<ReturnType<typeof parseNewPlace>["row"]>>>,
) {
  const { data: last } = await supabase
    .from("destinations")
    .select("sort_order")
    .eq("trip_id", tripId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  let order = (last?.sort_order ?? -1) + 1;

  const ids: Partial<Record<Side, string>> = {};
  for (const side of ["from", "to"] as const) {
    const row = rows[side];
    if (!row) continue;
    const dateOf = (local: string) => (local ? local.slice(0, 10) : null);
    const { data, error } = await supabase
      .from("destinations")
      .insert({
        ...row,
        trip_id: tripId,
        sort_order: order++,
        arrival_date: side === "to" ? dateOf(values.arrive_local) : null,
        departure_date: side === "from" ? dateOf(values.depart_local) : null,
      })
      .select("id")
      .single();
    if (error || !data) {
      console.error("createNewPlaces failed:", error?.code, error?.message);
      await supabase.from("destinations").delete().in("id", Object.values(ids));
      return null;
    }
    ids[side] = data.id as string;
  }
  return ids;
}

/** Wertet «Neuer Ort anlegen …» aus: Fehlermeldung oder die zu speichernden Daten. */
async function resolvePlaces(
  supabase: Supabase,
  tripId: string,
  values: Record<string, string>,
) {
  const cleaned = { ...values };
  const rows: Partial<Record<Side, NonNullable<ReturnType<typeof parseNewPlace>["row"]>>> = {};
  for (const side of ["from", "to"] as const) {
    if (values[`${side}_destination_id`] !== NEW_PLACE) continue;
    const res = parseNewPlace(values, side);
    if (res.error || !res.row) return { message: res.error ?? "Ungültiger neuer Ort." };
    rows[side] = res.row;
    cleaned[`${side}_destination_id`] = "";
    cleaned[`${side}_place`] = "";
  }
  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) return { message: parsed.error.issues[0].message };

  const created = Object.keys(rows).length ? await createNewPlaces(supabase, tripId, values, rows) : {};
  if (!created) return { message: "Der neue Ort konnte nicht gespeichert werden." };
  const data = {
    ...parsed.data,
    from_destination_id: created.from ?? parsed.data.from_destination_id,
    to_destination_id: created.to ?? parsed.data.to_destination_id,
  };
  return { data, createdIds: Object.values(created) as string[] };
}


type RouteInput = Pick<
  Transfer,
  "from_destination_id" | "to_destination_id" | "from_lat" | "from_lng" | "to_lat" | "to_lng"
> & { kind: string };

const NO_ROUTE = { route_geojson: null, route_distance_m: null, route_duration_s: null };

/**
 * Berechnet die Strassenroute einer Autofahrt (OpenRouteService) und speichert sie.
 * Für andere Arten oder ohne Koordinaten wird eine alte Route entfernt. Fehler brechen das
 * Speichern der Verschiebung nie ab; der Aufrufer bekommt nur eine Meldung.
 */
async function storeRoute(
  supabase: Supabase,
  tripId: string,
  transferId: string,
  t: RouteInput,
): Promise<{ ok: boolean; message: string }> {
  const reset = () => supabase.from("transfers").update(NO_ROUTE).eq("id", transferId).eq("trip_id", tripId);
  if (!(ROUTABLE_KINDS as readonly string[]).includes(t.kind)) {
    await reset();
    return { ok: false, message: "Strassenrouten gibt es nur für Autofahrten." };
  }

  const ids = [t.from_destination_id, t.to_destination_id].filter((x): x is string => !!x);
  const { data: rows } = ids.length
    ? await supabase.from("destinations").select("id, lat, lng").in("id", ids).eq("trip_id", tripId)
    : { data: [] };
  const coords = new Map((rows ?? []).map((r) => [r.id as string, r as { lat: number | null; lng: number | null }]));
  const point = (id: string | null, lat: number | null, lng: number | null) => {
    const d = id ? coords.get(id) : undefined;
    if (d) return d.lat !== null && d.lng !== null ? { lat: Number(d.lat), lng: Number(d.lng) } : null;
    return lat !== null && lng !== null ? { lat: Number(lat), lng: Number(lng) } : null;
  };
  const from = point(t.from_destination_id, t.from_lat, t.from_lng);
  const to = point(t.to_destination_id, t.to_lat, t.to_lng);
  if (!from || !to) {
    await reset();
    return { ok: false, message: "Start oder Ziel hat noch keinen Standort." };
  }

  const res = await fetchRoute(from, to);
  if (!res.ok) {
    if (res.reason !== "failed") await reset();
    return { ok: false, message: res.message };
  }
  const { error } = await supabase
    .from("transfers")
    .update({
      route_geojson: res.route.geometry,
      route_distance_m: res.route.distanceM,
      route_duration_s: res.route.durationS,
    })
    .eq("id", transferId)
    .eq("trip_id", tripId);
  if (error) {
    console.error("storeRoute failed:", error.code, error.message);
    return { ok: false, message: "Die Route konnte nicht gespeichert werden." };
  }
  const km = Math.round(res.route.distanceM / 1000);
  const min = Math.round(res.route.durationS / 60);
  return { ok: true, message: `Route berechnet: ${km} km, ${Math.floor(min / 60)} h ${min % 60} min.` };
}

export type RouteState = { ok: boolean; message: string } | null;

/** Knopf «Route neu berechnen» auf der Bearbeitungsseite. */
export async function recalculateRoute(
  tripId: string,
  transferId: string,
): Promise<RouteState> {
  if (!z.uuid().safeParse(tripId).success || !z.uuid().safeParse(transferId).success) {
    return { ok: false, message: "Ungültige Verschiebung." };
  }
  const supabase = await createClient();
  const { data: t } = await supabase
    .from("transfers")
    .select(TRANSFER_COLUMNS)
    .eq("id", transferId)
    .eq("trip_id", tripId)
    .maybeSingle<Transfer>();
  if (!t) return { ok: false, message: "Verschiebung nicht gefunden." };
  const result = await storeRoute(supabase, tripId, transferId, t);
  revalidatePath("/", "layout");
  return result;
}

export async function createTransfer(
  tripId: string,
  _prev: TransferFormState,
  formData: FormData,
): Promise<TransferFormState> {
  const values = read(formData);
  if (!uuid.safeParse(tripId).success) return { message: "Ungültige Reise.", values };

  const supabase = await createClient();
  const resolved = await resolvePlaces(supabase, tripId, values);
  if (!resolved.data) return { message: resolved.message ?? "Ungültige Eingabe.", values };

  const { data: created, error } = await supabase
    .from("transfers")
    .insert({ ...resolved.data, trip_id: tripId })
    .select("id")
    .single();
  if (error || !created) {
    console.error("createTransfer failed:", error?.code, error?.message);
    if (resolved.createdIds.length) await supabase.from("destinations").delete().in("id", resolved.createdIds);
    return { message: "Die Verschiebung konnte nicht gespeichert werden.", values };
  }
  await storeRoute(supabase, tripId, created.id as string, resolved.data);
  revalidatePath("/", "layout");
  redirect(`/trips/${tripId}`);
}

export async function updateTransfer(
  tripId: string,
  transferId: string,
  _prev: TransferFormState,
  formData: FormData,
): Promise<TransferFormState> {
  const values = read(formData);
  if (!uuid.safeParse(tripId).success || !uuid.safeParse(transferId).success) {
    return { message: "Ungültige Verschiebung.", values };
  }

  const supabase = await createClient();
  const resolved = await resolvePlaces(supabase, tripId, values);
  if (!resolved.data) return { message: resolved.message ?? "Ungültige Eingabe.", values };

  const { data, error } = await supabase
    .from("transfers")
    .update(resolved.data)
    .eq("id", transferId)
    .eq("trip_id", tripId)
    .select("id");
  if (error || !data?.length) {
    console.error("updateTransfer failed:", error?.code, error?.message);
    if (resolved.createdIds.length) await supabase.from("destinations").delete().in("id", resolved.createdIds);
    return { message: "Die Verschiebung konnte nicht gespeichert werden.", values };
  }
  await storeRoute(supabase, tripId, transferId, resolved.data);
  revalidatePath("/", "layout");
  redirect(`/trips/${tripId}`);
}

export async function deleteTransfer(tripId: string, transferId: string) {
  if (!uuid.safeParse(tripId).success || !uuid.safeParse(transferId).success) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from("transfers")
    .delete()
    .eq("id", transferId)
    .eq("trip_id", tripId);
  if (error) {
    console.error("deleteTransfer failed:", error.code, error.message);
    return;
  }
  revalidatePath("/", "layout");
  redirect(`/trips/${tripId}`);
}
