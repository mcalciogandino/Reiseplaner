"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isValidCoord, roundCoord } from "@/lib/geocode";
import { createClient } from "@/lib/supabase/server";

export type DestinationFormState = {
  message: string;
  values: Record<string, string>;
} | null;

const FIELDS = [
  "name", "arrival_date", "departure_date", "timezone", "description",
  "lodging_name", "lodging_address", "lodging_checkin", "lodging_booking_ref", "notes",
  "lat", "lng", "place_label",
] as const;

const text = (max: number) =>
  z.string().trim().max(max, `Maximal ${max} Zeichen.`).transform((v) => v || null);
const date = (msg: string) =>
  z.union([z.literal(""), z.iso.date(msg)]).transform((v) => v || null);

const schema = z
  .object({
    name: z.string().trim().min(1, "Bitte einen Namen eingeben.").max(100),
    arrival_date: date("Bitte ein gültiges Ankunftsdatum wählen."),
    departure_date: date("Bitte ein gültiges Abreisedatum wählen."),
    timezone: text(60),
    description: text(2000),
    lodging_name: text(150),
    lodging_address: text(250),
    lodging_checkin: z
      .union([z.literal(""), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Bitte eine Uhrzeit wählen.")])
      .transform((v) => v || null),
    lodging_booking_ref: text(100),
    notes: text(2000),
    lat: z.string().trim(),
    lng: z.string().trim(),
    place_label: text(200),
  })
  .refine((d) => (d.lat === "") === (d.lng === ""), {
    message: "Der Standort ist unvollständig. Bitte neu suchen.",
    path: ["lat"],
  })
  .refine((d) => d.lat === "" || isValidCoord(Number(d.lat), Number(d.lng)), {
    message: "Der Standort liegt ausserhalb des gültigen Bereichs.",
    path: ["lat"],
  })
  .transform((d) => ({
    ...d,
    lat: d.lat === "" ? null : roundCoord(Number(d.lat)),
    lng: d.lng === "" ? null : roundCoord(Number(d.lng)),
    place_label: d.lat === "" ? null : d.place_label,
  }))
  .refine(
    (d) => !d.arrival_date || !d.departure_date || d.departure_date >= d.arrival_date,
    { message: "Die Abreise darf nicht vor der Ankunft liegen.", path: ["departure_date"] },
  );

const uuid = z.uuid();

function read(formData: FormData) {
  return Object.fromEntries(FIELDS.map((k) => [k, String(formData.get(k) ?? "")]));
}

export async function createDestination(
  tripId: string,
  _prev: DestinationFormState,
  formData: FormData,
): Promise<DestinationFormState> {
  const values = read(formData);
  const parsed = schema.safeParse(values);
  if (!parsed.success) return { message: parsed.error.issues[0].message, values };
  if (!uuid.safeParse(tripId).success) return { message: "Ungültige Reise.", values };

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("destinations")
    .select("sort_order")
    .eq("trip_id", tripId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("destinations").insert({
    ...parsed.data,
    trip_id: tripId,
    sort_order: (last?.sort_order ?? -1) + 1,
  });
  if (error) {
    console.error("createDestination failed:", error.code, error.message);
    return { message: "Der Ort konnte nicht gespeichert werden.", values };
  }
  revalidatePath("/", "layout");
  redirect(`/trips/${tripId}`);
}

export async function updateDestination(
  tripId: string,
  destId: string,
  _prev: DestinationFormState,
  formData: FormData,
): Promise<DestinationFormState> {
  const values = read(formData);
  const parsed = schema.safeParse(values);
  if (!parsed.success) return { message: parsed.error.issues[0].message, values };
  if (!uuid.safeParse(tripId).success || !uuid.safeParse(destId).success) {
    return { message: "Ungültiger Ort.", values };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("destinations")
    .update(parsed.data)
    .eq("id", destId)
    .eq("trip_id", tripId)
    .select("id");
  if (error || !data?.length) {
    console.error("updateDestination failed:", error?.code, error?.message);
    return { message: "Der Ort konnte nicht gespeichert werden.", values };
  }
  revalidatePath("/", "layout");
  redirect(`/trips/${tripId}`);
}

export async function deleteDestination(tripId: string, destId: string) {
  if (!uuid.safeParse(tripId).success || !uuid.safeParse(destId).success) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from("destinations")
    .delete()
    .eq("id", destId)
    .eq("trip_id", tripId);
  if (error) {
    console.error("deleteDestination failed:", error.code, error.message);
    return;
  }
  revalidatePath("/", "layout");
  redirect(`/trips/${tripId}`);
}

/** Tauscht die Position mit dem Nachbarn in der Routenreihenfolge. */
export async function moveDestination(
  tripId: string,
  destId: string,
  direction: "up" | "down",
) {
  if (!uuid.safeParse(tripId).success || !uuid.safeParse(destId).success) return;
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("destinations")
    .select("id")
    .eq("trip_id", tripId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (!rows) return;

  const ids = rows.map((r) => r.id as string);
  const i = ids.indexOf(destId);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];

  // Positionen lückenlos neu vergeben, damit gleiche sort_order-Werte keine Rolle spielen.
  const results = await Promise.all(
    ids.map((id, order) =>
      supabase.from("destinations").update({ sort_order: order }).eq("id", id).eq("trip_id", tripId),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) console.error("moveDestination failed:", failed.error.code);
  revalidatePath("/", "layout");
}
