"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { researchChecklist } from "@/lib/ai/claude";
import { tripContext } from "@/lib/ai/prompt";
import { loadSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { TRIP_COLUMNS, type Trip } from "@/lib/trips";

export type ChecklistState = { message: string } | null;
export type Suggestion = { title: string; due_date: string | null; reason: string | null; sources: string[] };
export type SuggestState = { message?: string; items?: Suggestion[] } | null;

const uuid = z.uuid();
const itemSchema = z.object({
  title: z.string().trim().min(1, "Bitte einen Titel eingeben.").max(200, "Maximal 200 Zeichen."),
  due_date: z.union([z.literal(""), z.iso.date()]).transform((v) => v || null),
  list: z.enum(["prep", "packing"]),
});

export async function addItem(tripId: string, _prev: ChecklistState, fd: FormData): Promise<ChecklistState> {
  if (!uuid.safeParse(tripId).success) return { message: "Ungültige Reise." };
  const parsed = itemSchema.safeParse({
    title: fd.get("title") ?? "",
    due_date: fd.get("due_date") ?? "",
    list: fd.get("list") ?? "prep",
  });
  if (!parsed.success) return { message: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.from("checklist_items").insert({ trip_id: tripId, ...parsed.data });
  if (error) {
    console.error("addItem failed:", error.code);
    return { message: "Die Aufgabe konnte nicht gespeichert werden." };
  }
  revalidatePath(`/trips/${tripId}/checklist`);
  return null;
}

export async function toggleItem(tripId: string, itemId: string, done: boolean) {
  if (!uuid.safeParse(tripId).success || !uuid.safeParse(itemId).success) return;
  const supabase = await createClient();
  await supabase.from("checklist_items").update({ done }).eq("id", itemId).eq("trip_id", tripId);
  revalidatePath(`/trips/${tripId}/checklist`);
}

export async function deleteItem(tripId: string, itemId: string) {
  if (!uuid.safeParse(tripId).success || !uuid.safeParse(itemId).success) return;
  const supabase = await createClient();
  await supabase.from("checklist_items").delete().eq("id", itemId).eq("trip_id", tripId);
  revalidatePath(`/trips/${tripId}/checklist`);
}

/** KI recherchiert Fristen und Reservierungen für die Route; es wird nichts gespeichert. */
export async function suggestItems(tripId: string): Promise<SuggestState> {
  if (!uuid.safeParse(tripId).success) return { message: "Ungültige Reise." };
  const supabase = await createClient();
  const { data: trip } = await supabase.from("trips").select(TRIP_COLUMNS).eq("id", tripId).maybeSingle<Trip>();
  if (!trip) return { message: "Reise nicht gefunden." };
  const [{ data: stops }, { data: existing }] = await Promise.all([
    supabase
      .from("destinations")
      .select("id, name, timezone, lat, lng, arrival_date, departure_date")
      .eq("trip_id", tripId)
      .order("sort_order", { ascending: true }),
    supabase.from("checklist_items").select("title").eq("trip_id", tripId),
  ]);
  const context =
    tripContext({
      name: trip.name,
      start_date: trip.start_date,
      end_date: trip.end_date,
      places: (stops ?? []) as never,
      transfers: [],
    }) + `\nBereits in der Checkliste:\n${(existing ?? []).map((e) => `- ${e.title}`).join("\n") || "(nichts)"}`;

  const settings = await loadSettings(supabase);
  const today = new Date().toISOString().slice(0, 10);
  const res = await researchChecklist(context, today, { apiKey: settings.anthropicKey, model: settings.model });
  if (!res.ok) return { message: res.message };
  if (res.items.length === 0) return { message: "Die KI hat keine neuen Aufgaben gefunden." };
  return {
    items: res.items.map((i) => ({
      title: i.title,
      due_date: i.due_date ?? null,
      reason: i.reason ?? null,
      sources: i.sources,
    })),
  };
}

const applySchema = z.array(
  z.object({
    title: z.string().trim().min(1).max(200),
    due_date: z.iso.date().nullable(),
    reason: z.string().max(600).nullable(),
    sources: z.array(z.url().refine((u) => /^https?:\/\//i.test(u))).max(3),
  }),
);

/** Die ausgewählten Vorschläge als Aufgaben speichern (vorbereitende Liste, Quelle «ai»). */
export async function applySuggestions(tripId: string, _prev: ChecklistState, fd: FormData): Promise<ChecklistState> {
  if (!uuid.safeParse(tripId).success) return { message: "Ungültige Reise." };
  let raw: unknown;
  try {
    raw = JSON.parse(String(fd.get("items") ?? ""));
  } catch {
    return { message: "Die Vorschläge sind nicht mehr gültig. Bitte suche erneut." };
  }
  const parsed = applySchema.safeParse(raw);
  if (!parsed.success) return { message: "Die Vorschläge sind nicht mehr gültig. Bitte suche erneut." };
  const chosen = new Set(fd.getAll("pick").map(String));
  const rows = parsed.data
    .filter((_, i) => chosen.has(String(i)))
    .map((i) => ({
      trip_id: tripId,
      list: "prep",
      title: i.title,
      due_date: i.due_date,
      notes: i.reason,
      source_ref: i.sources[0] ?? null,
      source: "ai",
      reviewed: true,
    }));
  if (rows.length === 0) return { message: "Es ist nichts ausgewählt." };
  const supabase = await createClient();
  const { error } = await supabase.from("checklist_items").insert(rows);
  if (error) {
    console.error("applySuggestions failed:", error.code);
    return { message: "Das Speichern ist fehlgeschlagen." };
  }
  revalidatePath(`/trips/${tripId}/checklist`);
  return null;
}
