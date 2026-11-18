"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type BookedTable = "destinations" | "transfers" | "vehicles";
const tables = z.enum(["destinations", "transfers", "vehicles"]);
const uuid = z.uuid();

/** Setzt oder löscht die Markierung «gebucht» an einem Ort, einer Verschiebung oder einem Fahrzeug. */
export async function setBooked(tripId: string, table: BookedTable, id: string, booked: boolean) {
  const t = tables.safeParse(table);
  if (!t.success || !uuid.safeParse(tripId).success || !uuid.safeParse(id).success) return;
  const supabase = await createClient();
  const { error } = await supabase.from(t.data).update({ booked }).eq("id", id).eq("trip_id", tripId);
  if (error) console.error("setBooked failed:", error.code);
  revalidatePath(`/trips/${tripId}`, "layout");
}
