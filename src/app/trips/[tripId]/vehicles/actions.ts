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
  "return_tz", "booking_ref", "price", "currency", "notes",
] as const;

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
    price: d.price,
    currency: d.price !== null ? (d.currency ?? "CAD") : d.currency,
    notes: d.notes,
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
