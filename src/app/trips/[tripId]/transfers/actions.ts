"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { TIMEZONES } from "@/lib/destinations";
import { createClient } from "@/lib/supabase/server";
import { locationSchema, NEW_PLACE, NEW_PLACE_KEYS, newPlaceBaseSchema } from "@/lib/place-fields";
import { KINDS, localToUtcIso } from "@/lib/transfers";

export type TransferFormState = {
  message: string;
  values: Record<string, string>;
} | null;

const FIELDS = [
  "kind", "from_destination_id", "to_destination_id", "from_place", "to_place",
  "depart_local", "depart_tz", "arrive_local", "arrive_tz",
  "duration_min", "distance_km", "carrier", "flight_number", "booking_ref",
  ...(["from", "to"] as const).flatMap((side) => NEW_PLACE_KEYS.map((k) => `${side}_new_${k}`)),
];

const zones = TIMEZONES.map((t) => t.value) as string[];
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
  })
  .superRefine((d, ctx) => {
    for (const [local, tz, label] of [
      [d.depart_local, d.depart_tz, "Abfahrt"],
      [d.arrive_local, d.arrive_tz, "Ankunft"],
    ] as const) {
      if (local && !zones.includes(tz)) {
        ctx.addIssue({ code: "custom", message: `${label}: bitte eine Zeitzone wählen.` });
      }
    }
  })
  .transform((d) => ({
    kind: d.kind,
    from_destination_id: d.from_destination_id,
    to_destination_id: d.to_destination_id,
    from_place: d.from_place,
    to_place: d.to_place,
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

  const { error } = await supabase.from("transfers").insert({ ...resolved.data, trip_id: tripId });
  if (error) {
    console.error("createTransfer failed:", error.code, error.message);
    if (resolved.createdIds.length) await supabase.from("destinations").delete().in("id", resolved.createdIds);
    return { message: "Die Verschiebung konnte nicht gespeichert werden.", values };
  }
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
