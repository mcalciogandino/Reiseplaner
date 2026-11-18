"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { tidyAfterInsert } from "./timeline-actions";

const uuid = z.uuid();
const fixSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("merge"), keep: uuid, remove: uuid }),
  z.object({ kind: z.literal("add_transfer"), from: uuid, to: uuid }),
  z.object({ kind: z.literal("set_transfer_from"), transfer: uuid, from: uuid }),
  z.object({ kind: z.literal("set_place_arrival"), place: uuid, date: z.iso.date() }),
]);

export type FixState = { message: string } | null;

/** Spalten, die beim Zusammenführen vom entfernten Ort übernommen werden, wenn sie beim behaltenen leer sind. */
const FILL = [
  "lodging_name", "lodging_address", "lodging_checkin", "lodging_checkout", "lodging_price", "lodging_currency",
  "lodging_booking_ref", "lat", "lng", "place_label", "timezone", "notes", "description",
  "addr_street", "addr_house_number", "addr_postcode", "addr_city", "addr_region", "addr_country",
] as const;

/** Wendet eine einzelne Korrektur des Plan-Checks an. Alle Verweise werden gegen die Reise geprüft. */
export async function applyFix(tripId: string, fixJson: string): Promise<void> {
  if (!uuid.safeParse(tripId).success) return;
  let raw: unknown;
  try {
    raw = JSON.parse(fixJson);
  } catch {
    return;
  }
  const parsed = fixSchema.safeParse(raw);
  if (!parsed.success) return;
  const fix = parsed.data;
  const supabase = await createClient();
  const fail = (what: string, error: { code?: string } | null) => console.error(`applyFix ${fix.kind} ${what} failed:`, error?.code);

  const place = async (id: string) => {
    const { data } = await supabase.from("destinations").select("*").eq("id", id).eq("trip_id", tripId).maybeSingle();
    return data as Record<string, unknown> | null;
  };

  if (fix.kind === "merge") {
    const [keep, remove] = await Promise.all([place(fix.keep), place(fix.remove)]);
    if (!keep || !remove || fix.keep === fix.remove) return;
    const patch: Record<string, unknown> = {};
    for (const c of FILL) if ((keep[c] === null || keep[c] === "") && remove[c] !== null && remove[c] !== "") patch[c] = remove[c];
    const dates = (k: string) => [keep[k], remove[k]].filter((v): v is string => typeof v === "string");
    const arr = dates("arrival_date").sort()[0];
    const dep = dates("departure_date").sort().at(-1);
    if (arr) patch.arrival_date = arr;
    if (dep) patch.departure_date = dep;
    if (remove.booked === true) patch.booked = true;
    if (Object.keys(patch).length) {
      const { error } = await supabase.from("destinations").update(patch).eq("id", fix.keep).eq("trip_id", tripId);
      if (error) return fail("update", error);
    }
    // Verweise umbiegen, dann den Doppelgänger löschen.
    for (const [table, col] of [
      ["transfers", "from_destination_id"], ["transfers", "to_destination_id"],
      ["activities", "destination_id"], ["day_plans", "destination_id"], ["lodging_options", "destination_id"],
    ] as const) {
      const { error } = await supabase.from(table).update({ [col]: fix.keep }).eq(col, fix.remove).eq("trip_id", tripId);
      if (error) return fail(`${table}.${col}`, error);
    }
    // Verschiebungen, die nun von einem Ort zu sich selbst führen, sind sinnlos.
    const { data: legs } = await supabase.from("transfers").select("id, from_destination_id, to_destination_id").eq("trip_id", tripId).eq("from_destination_id", fix.keep).eq("to_destination_id", fix.keep);
    if (legs?.length) await supabase.from("transfers").delete().in("id", legs.map((l) => l.id as string)).eq("trip_id", tripId);
    const { error } = await supabase.from("destinations").delete().eq("id", fix.remove).eq("trip_id", tripId);
    if (error) return fail("delete", error);
  } else if (fix.kind === "add_transfer") {
    const [a, b] = await Promise.all([place(fix.from), place(fix.to)]);
    if (!a || !b) return;
    const { data, error } = await supabase
      .from("transfers")
      .insert({ trip_id: tripId, kind: "drive", from_destination_id: fix.from, to_destination_id: fix.to, source: "user", reviewed: true })
      .select("id")
      .single();
    if (error || !data) return fail("insert", error);
    await tidyAfterInsert(tripId, [`t-${data.id}`]);
  } else if (fix.kind === "set_transfer_from") {
    if (!(await place(fix.from))) return;
    const { error } = await supabase
      .from("transfers")
      .update({ from_destination_id: fix.from, from_place: null, from_lat: null, from_lng: null, route_geojson: null, route_distance_m: null, route_duration_s: null })
      .eq("id", fix.transfer)
      .eq("trip_id", tripId);
    if (error) return fail("update", error);
  } else {
    const p = await place(fix.place);
    if (!p) return;
    const dep = typeof p.departure_date === "string" && p.departure_date < fix.date ? fix.date : p.departure_date;
    const { error } = await supabase.from("destinations").update({ arrival_date: fix.date, departure_date: dep }).eq("id", fix.place).eq("trip_id", tripId);
    if (error) return fail("update", error);
  }
  revalidatePath(`/trips/${tripId}`, "layout");
}
