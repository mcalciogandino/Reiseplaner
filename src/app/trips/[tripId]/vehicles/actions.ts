"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isValidTimeZone } from "@/lib/timezone";
import { localToUtcIso } from "@/lib/transfers";
import { createClient } from "@/lib/supabase/server";

export type VehicleFormState = { message: string; values?: Record<string, string> } | null;

const uuid = z.uuid();
const optText = (max: number) =>
  z.string().trim().max(max, `Maximal ${max} Zeichen.`).transform((v) => v || null);
const local = z
  .union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/, "Bitte Datum und Uhrzeit (24 h) angeben.")])
  .transform((v) => v || null);

const FIELDS = [
  "kind", "provider", "vehicle_name", "pickup_place", "pickup_local", "pickup_tz", "return_place", "return_local",
  "return_tz", "booking_ref", "booked", "price", "currency", "notes",
  ...(["pickup_", "return_"] as const).flatMap((p) =>
    ["lat", "lng", "place_label", "addr_street", "addr_house_number", "addr_postcode", "addr_city", "addr_region", "addr_country"].map((f) => `${p}${f}`),
  ),
] as const;

const coord = (min: number, max: number) =>
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v)))
    .refine((v) => v === null || (Number.isFinite(v) && v >= min && v <= max), "Ungültiger Standort.");
const addrPart = z.string().trim().max(150).default("");

function locationFields(p: "pickup_" | "return_") {
  return {
    [`${p}lat`]: coord(-90, 90),
    [`${p}lng`]: coord(-180, 180),
    [`${p}place_label`]: z.string().trim().max(200).default(""),
    [`${p}addr_street`]: addrPart,
    [`${p}addr_house_number`]: addrPart,
    [`${p}addr_postcode`]: addrPart,
    [`${p}addr_city`]: addrPart,
    [`${p}addr_region`]: addrPart,
    [`${p}addr_country`]: addrPart,
  };
}

/** Standort einer Seite für die Datenbank; ohne vollständige Koordinaten bleibt alles leer. */
function locationOut(d: Record<string, unknown>, p: "pickup" | "return") {
  const lat = d[`${p}_lat`] as number | null;
  const lng = d[`${p}_lng`] as number | null;
  const has = lat !== null && lng !== null;
  const a = (k: string) => String(d[`${p}_addr_${k}`] ?? "");
  const address = { street: a("street"), house_number: a("house_number"), postcode: a("postcode"), city: a("city"), region: a("region"), country: a("country") };
  return {
    [`${p}_lat`]: has ? lat : null,
    [`${p}_lng`]: has ? lng : null,
    [`${p}_label`]: has ? String(d[`${p}_place_label`] ?? "") || null : null,
    [`${p}_address`]: has ? address : null,
  };
}

const schema = z
  .object({
    kind: z.enum(["car", "camper", "other"]),
    provider: optText(100),
    vehicle_name: optText(100),
    pickup_place: optText(150),
    pickup_local: local,
    pickup_tz: z.string().trim(),
    return_place: optText(150),
    return_local: local,
    return_tz: z.string().trim(),
    booking_ref: optText(100),
    booked: z.string().transform((v) => v === "on"),
    price: z
      .string()
      .trim()
      .refine((v) => v === "" || /^\d{1,7}([.,]\d{1,2})?$/.test(v), "Bitte einen Preis wie 900 oder 899.90 eingeben.")
      .transform((v) => (v === "" ? null : Number(v.replace(",", ".")))),
    currency: z
      .string()
      .trim()
      .refine((v) => v === "" || /^[A-Za-z]{3}$/.test(v), "Bitte die Währung mit drei Buchstaben angeben, z. B. CAD.")
      .transform((v) => (v === "" ? null : v.toUpperCase())),
    notes: optText(500),
    ...locationFields("pickup_"),
    ...locationFields("return_"),
  })
  .superRefine((d, ctx) => {
    if (d.pickup_local && !isValidTimeZone(d.pickup_tz)) {
      ctx.addIssue({ code: "custom", message: "Bitte die Zeitzone der Übernahme wählen.", path: ["pickup_tz"] });
    }
    if (d.return_local && !isValidTimeZone(d.return_tz)) {
      ctx.addIssue({ code: "custom", message: "Bitte die Zeitzone der Rückgabe wählen.", path: ["return_tz"] });
    }
  })
  .transform((d) => ({
    kind: d.kind,
    provider: d.provider,
    vehicle_name: d.vehicle_name,
    pickup_place: d.pickup_place,
    pickup_at: d.pickup_local ? localToUtcIso(d.pickup_local, d.pickup_tz) : null,
    pickup_tz: d.pickup_local ? d.pickup_tz : null,
    return_place: d.return_place,
    return_at: d.return_local ? localToUtcIso(d.return_local, d.return_tz) : null,
    return_tz: d.return_local ? d.return_tz : null,
    booking_ref: d.booking_ref,
    booked: d.booked,
    price: d.price,
    currency: d.price !== null ? (d.currency ?? "CAD") : d.currency,
    notes: d.notes,
    ...locationOut(d, "pickup"),
    ...locationOut(d, "return"),
  }))
  .refine((d) => !d.pickup_at || !d.return_at || d.return_at > d.pickup_at, {
    message: "Die Rückgabe muss nach der Übernahme liegen.",
    path: ["return_local"],
  });

function read(fd: FormData) {
  const values: Record<string, string> = {};
  for (const k of FIELDS) values[k] = String(fd.get(k) ?? "");
  return { values, parsed: schema.safeParse(values) };
}

export async function createVehicle(tripId: string, _prev: VehicleFormState, fd: FormData): Promise<VehicleFormState> {
  if (!uuid.safeParse(tripId).success) return { message: "Ungültige Reise." };
  const { values, parsed } = read(fd);
  if (!parsed.success) return { message: parsed.error.issues[0].message, values };
  const supabase = await createClient();
  const { error } = await supabase.from("vehicles").insert({ trip_id: tripId, ...parsed.data, source: "user" });
  if (error) {
    console.error("createVehicle failed:", error.code);
    return { message: "Das Fahrzeug konnte nicht gespeichert werden.", values };
  }
  revalidatePath(`/trips/${tripId}`, "layout");
  redirect(`/trips/${tripId}/vehicles`);
}

export async function updateVehicle(
  tripId: string,
  vehicleId: string,
  _prev: VehicleFormState,
  fd: FormData,
): Promise<VehicleFormState> {
  if (!uuid.safeParse(tripId).success || !uuid.safeParse(vehicleId).success) return { message: "Ungültige Angaben." };
  const { values, parsed } = read(fd);
  if (!parsed.success) return { message: parsed.error.issues[0].message, values };
  const supabase = await createClient();
  const { error } = await supabase.from("vehicles").update(parsed.data).eq("id", vehicleId).eq("trip_id", tripId);
  if (error) {
    console.error("updateVehicle failed:", error.code);
    return { message: "Das Fahrzeug konnte nicht gespeichert werden.", values };
  }
  revalidatePath(`/trips/${tripId}`, "layout");
  redirect(`/trips/${tripId}/vehicles`);
}

export async function deleteVehicle(tripId: string, vehicleId: string) {
  if (!uuid.safeParse(tripId).success || !uuid.safeParse(vehicleId).success) return;
  const supabase = await createClient();
  await supabase.from("vehicles").delete().eq("id", vehicleId).eq("trip_id", tripId);
  revalidatePath(`/trips/${tripId}`, "layout");
}
