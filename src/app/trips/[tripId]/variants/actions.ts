"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { planVariantCopy, readCopyOptions, type Row, type Snapshot } from "@/lib/variant-copy";

export type VariantFormState = { message: string; values: Record<string, string> } | null;

const uuid = z.uuid();
const nameSchema = z.string().trim().min(1, "Bitte einen Namen eingeben.").max(60, "Der Name ist zu lang (höchstens 60 Zeichen).");

/** Alle Zeilen der Quell-Reise, die für eine Kopie in Frage kommen. */
async function loadSnapshot(tripId: string): Promise<Snapshot | null> {
  const supabase = await createClient();
  const all = async (table: string): Promise<Row[]> => {
    const { data, error } = await supabase.from(table).select("*").eq("trip_id", tripId);
    if (error) throw new Error(`${table}: ${error.code}`);
    return (data ?? []) as Row[];
  };
  const { data: trip } = await supabase.from("trips").select("*").eq("id", tripId).maybeSingle();
  if (!trip) return null;
  const [destinations, transfers, vehicles, activities, dayPlans, budgetEntries, checklistItems] = await Promise.all([
    all("destinations"), all("transfers"), all("vehicles"), all("activities"), all("day_plans"), all("budget_entries"), all("checklist_items"),
  ]);
  const actIds = activities.map((a) => a.id as string);
  const planIds = dayPlans.map((d) => d.id as string);
  const votes = actIds.length ? await supabase.from("activity_votes").select("*").in("activity_id", actIds) : { data: [] };
  const items = planIds.length ? await supabase.from("day_plan_items").select("*").in("day_plan_id", planIds) : { data: [] };
  return {
    trip: trip as Row,
    destinations, transfers, vehicles, activities, dayPlans, budgetEntries, checklistItems,
    activityVotes: (votes.data ?? []) as Row[],
    dayPlanItems: (items.data ?? []) as Row[],
  };
}

const TABLES: [keyof Omit<ReturnType<typeof planVariantCopy>, "trip">, string][] = [
  ["destinations", "destinations"],
  ["vehicles", "vehicles"], // vor den Verschiebungen (transfers.vehicle_id)
  ["transfers", "transfers"],
  ["activities", "activities"],
  ["activityVotes", "activity_votes"],
  ["dayPlans", "day_plans"],
  ["dayPlanItems", "day_plan_items"],
  ["budgetEntries", "budget_entries"],
  ["checklistItems", "checklist_items"],
];

export async function createVariant(
  tripId: string,
  _prev: VariantFormState,
  formData: FormData,
): Promise<VariantFormState> {
  const values = { name: String(formData.get("name") ?? "") };
  const name = nameSchema.safeParse(values.name);
  if (!name.success) return { message: name.error.issues[0].message, values };
  if (!uuid.safeParse(tripId).success) return { message: "Ungültige Reise.", values };

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) redirect("/login");

  let newTripId: string;
  try {
    const snap = await loadSnapshot(tripId);
    if (!snap) return { message: "Reise nicht gefunden.", values };
    newTripId = randomUUID();
    const rows = planVariantCopy(snap, readCopyOptions(formData), newTripId, name.data, userId, randomUUID);

    const { error } = await supabase.from("trips").insert(rows.trip);
    if (error) throw new Error(`trips: ${error.code} ${error.message}`);
    try {
      for (const [key, table] of TABLES) {
        const list = rows[key];
        if (!list.length) continue;
        const res = await supabase.from(table).insert(list);
        if (res.error) throw new Error(`${table}: ${res.error.code} ${res.error.message}`);
      }
    } catch (e) {
      await supabase.from("trips").delete().eq("id", newTripId); // Kaskade räumt die Teilkopie weg
      throw e;
    }
  } catch (e) {
    console.error("createVariant failed:", e);
    return { message: "Die Variante konnte nicht erstellt werden.", values };
  }
  revalidatePath("/", "layout");
  redirect(`/trips/${newTripId}`);
}

export async function renameVariant(tripId: string, formData: FormData) {
  const name = nameSchema.safeParse(String(formData.get("name") ?? ""));
  if (!name.success || !uuid.safeParse(tripId).success) return;
  const supabase = await createClient();
  const { error } = await supabase.from("trips").update({ variant_name: name.data }).eq("id", tripId);
  if (error) console.error("renameVariant failed:", error.code);
  revalidatePath("/", "layout");
}

/** Macht eine Variante zum Hauptplan; der bisherige Hauptplan und alle anderen werden ihre Varianten. */
export async function promoteVariant(tripId: string) {
  if (!uuid.safeParse(tripId).success) return;
  const supabase = await createClient();
  const { data: v } = await supabase.from("trips").select("id, variant_of").eq("id", tripId).maybeSingle();
  if (!v?.variant_of) return;
  const oldRoot = v.variant_of as string;
  const steps = [
    supabase.from("trips").update({ variant_of: tripId }).eq("variant_of", oldRoot).neq("id", tripId),
    supabase.from("trips").update({ variant_of: tripId }).eq("id", oldRoot),
  ];
  for (const s of steps) {
    const { error } = await s;
    if (error) {
      console.error("promoteVariant failed:", error.code);
      return;
    }
  }
  const { error } = await supabase.from("trips").update({ variant_of: null }).eq("id", tripId);
  if (error) console.error("promoteVariant failed:", error.code);
  revalidatePath("/", "layout");
  redirect(`/trips/${tripId}/variants`);
}

/** Löscht eine Variante (nie den Hauptplan: dessen Löschen würde alle Varianten mitnehmen). */
export async function deleteVariant(tripId: string) {
  if (!uuid.safeParse(tripId).success) return;
  const supabase = await createClient();
  const { data: v } = await supabase.from("trips").select("variant_of").eq("id", tripId).maybeSingle();
  if (!v?.variant_of) return;
  const { error } = await supabase.from("trips").delete().eq("id", tripId);
  if (error) {
    console.error("deleteVariant failed:", error.code);
    return;
  }
  revalidatePath("/", "layout");
  redirect(`/trips/${v.variant_of}/variants`);
}
