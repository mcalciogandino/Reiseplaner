"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DESTINATION_COLUMNS, type Destination } from "@/lib/destinations";
import { createClient } from "@/lib/supabase/server";
import { buildTimeline } from "@/lib/timeline";
import { TRANSFER_COLUMNS, type Transfer } from "@/lib/transfers";

const uuid = z.uuid();

/** Tauscht einen Ort oder eine Verschiebung mit dem Nachbarn auf der Zeitleiste. */
export async function moveNode(tripId: string, key: string, direction: "up" | "down") {
  if (!uuid.safeParse(tripId).success || !/^[pt]-[0-9a-f-]{36}$/.test(key)) return;
  const supabase = await createClient();
  const [{ data: trip }, { data: dests }, { data: legs }] = await Promise.all([
    supabase.from("trips").select("timeline_order").eq("id", tripId).maybeSingle(),
    supabase.from("destinations").select(DESTINATION_COLUMNS).eq("trip_id", tripId).order("sort_order").order("created_at").returns<Destination[]>(),
    supabase.from("transfers").select(TRANSFER_COLUMNS).eq("trip_id", tripId).eq("is_option", false).order("depart_at", { ascending: true, nullsFirst: false }).order("created_at").returns<Transfer[]>(),
  ]);
  if (!trip) return;
  const pinned = ((trip.timeline_order as string[] | null) ?? []);
  const main = buildTimeline(dests ?? [], legs ?? [], pinned)
    .filter((n) => n.type !== "free")
    .map((n) => n.key);
  const i = main.indexOf(key);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= main.length) return;
  [main[i], main[j]] = [main[j], main[i]];
  const { error } = await supabase.from("trips").update({ timeline_order: main }).eq("id", tripId);
  if (error) console.error("moveNode failed:", error.code);
  revalidatePath(`/trips/${tripId}`, "layout");
}

/** Hebt die von Hand festgelegte Reihenfolge auf; die Zeitleiste sortiert wieder nach der Zeit. */
export async function resetOrder(tripId: string) {
  if (!uuid.safeParse(tripId).success) return;
  const supabase = await createClient();
  await supabase.from("trips").update({ timeline_order: [] }).eq("id", tripId);
  revalidatePath(`/trips/${tripId}`, "layout");
}
