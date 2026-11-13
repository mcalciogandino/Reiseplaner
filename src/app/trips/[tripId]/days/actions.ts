"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { suggestDayProgram } from "@/lib/ai/claude";
import { placesOnDay, transfersOnDay } from "@/lib/days";
import { DESTINATION_COLUMNS, type Destination } from "@/lib/destinations";
import { loadSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { KIND_LABELS, formatDuration, durationMinutes, TRANSFER_COLUMNS, type Transfer } from "@/lib/transfers";
import { TRIP_COLUMNS, type Trip } from "@/lib/trips";

export type DayState = { message: string } | null;
export type DaySuggestions = {
  message?: string;
  items?: { title: string; start_time: string | null; end_time: string | null; description: string | null; plan_b: boolean }[];
} | null;

const uuid = z.uuid();
const date = z.iso.date();
const hhmm = z.union([z.literal(""), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)]).transform((v) => v || null);

const itemSchema = z
  .object({
    title: z.string().trim().min(1, "Bitte einen Titel eingeben.").max(150, "Maximal 150 Zeichen."),
    start_time: hhmm,
    end_time: hhmm,
    description: z.string().trim().max(500).nullable().optional().transform((v) => v || null),
    plan_b: z.boolean(),
  })
  .refine((v) => !v.start_time || !v.end_time || v.end_time > v.start_time, "Das Ende muss nach dem Beginn liegen.");

async function ensureDay(supabase: Awaited<ReturnType<typeof createClient>>, tripId: string, day: string) {
  const { data: trip } = await supabase.from("trips").select("start_date, end_date").eq("id", tripId).maybeSingle();
  if (!trip || day < (trip.start_date as string) || day > (trip.end_date as string)) return null;
  const { data: dests } = await supabase
    .from("destinations")
    .select("id, arrival_date, departure_date")
    .eq("trip_id", tripId);
  const here = placesOnDay((dests ?? []) as { id: string; arrival_date: string | null; departure_date: string | null }[], day);
  const { data, error } = await supabase
    .from("day_plans")
    .upsert({ trip_id: tripId, date: day, destination_id: here[0]?.id ?? null }, { onConflict: "trip_id,date" })
    .select("id")
    .single();
  if (error || !data) {
    console.error("ensureDay failed:", error?.code);
    return null;
  }
  return data.id as string;
}

async function insertItems(tripId: string, day: string, items: z.output<typeof itemSchema>[], source: "user" | "ai") {
  const supabase = await createClient();
  const planId = await ensureDay(supabase, tripId, day);
  if (!planId) return "Der Tag liegt ausserhalb der Reise oder konnte nicht angelegt werden.";
  const { data: last } = await supabase
    .from("day_plan_items")
    .select("sort_order")
    .eq("day_plan_id", planId)
    .order("sort_order", { ascending: false })
    .limit(1);
  let order = ((last?.[0]?.sort_order as number | undefined) ?? -1) + 1;
  const { error } = await supabase.from("day_plan_items").insert(
    items.map((i) => ({ day_plan_id: planId, ...i, sort_order: order++, source, reviewed: true })),
  );
  if (error) {
    console.error("insertItems failed:", error.code);
    return "Das Speichern ist fehlgeschlagen.";
  }
  revalidatePath(`/trips/${tripId}/days`);
  return null;
}

export async function addDayItem(tripId: string, day: string, _prev: DayState, fd: FormData): Promise<DayState> {
  if (!uuid.safeParse(tripId).success || !date.safeParse(day).success) return { message: "Ungültige Angaben." };
  const parsed = itemSchema.safeParse({
    title: fd.get("title") ?? "",
    start_time: fd.get("start_time") ?? "",
    end_time: fd.get("end_time") ?? "",
    description: null,
    plan_b: fd.get("plan_b") === "on",
  });
  if (!parsed.success) return { message: parsed.error.issues[0].message };
  const err = await insertItems(tripId, day, [parsed.data], "user");
  return err ? { message: err } : null;
}

export async function deleteDayItem(tripId: string, itemId: string) {
  if (!uuid.safeParse(tripId).success || !uuid.safeParse(itemId).success) return;
  const supabase = await createClient();
  await supabase.from("day_plan_items").delete().eq("id", itemId);
  revalidatePath(`/trips/${tripId}/days`);
}

/** KI schlägt ein Tagesprogramm vor; gespeichert wird erst nach der Auswahl. */
export async function suggestDay(tripId: string, day: string): Promise<DaySuggestions> {
  if (!uuid.safeParse(tripId).success || !date.safeParse(day).success) return { message: "Ungültige Angaben." };
  const supabase = await createClient();
  const { data: trip } = await supabase.from("trips").select(TRIP_COLUMNS).eq("id", tripId).maybeSingle<Trip>();
  if (!trip) return { message: "Reise nicht gefunden." };
  const [{ data: dests }, { data: legs }, { data: plan }] = await Promise.all([
    supabase.from("destinations").select(DESTINATION_COLUMNS).eq("trip_id", tripId).returns<Destination[]>(),
    supabase.from("transfers").select(TRANSFER_COLUMNS).eq("trip_id", tripId).eq("is_option", false).returns<Transfer[]>(),
    supabase.from("day_plans").select("id").eq("trip_id", tripId).eq("date", day).maybeSingle(),
  ]);
  const here = placesOnDay(dests ?? [], day);
  const moves = transfersOnDay(legs ?? [], day);
  const { data: existing } = plan
    ? await supabase.from("day_plan_items").select("title, start_time").eq("day_plan_id", plan.id)
    : { data: [] };

  const lines = [
    `Reise: ${trip.name}. Tag: ${day}.`,
    "Orte an diesem Tag:",
    ...(here.length
      ? here.map((p) => `- ${p.name} (${p.kind})${p.place_label ? `, ${p.place_label}` : ""}${p.lodging_name ? `, Unterkunft ${p.lodging_name}` : ""}`)
      : ["(kein Ort erfasst)"]),
    "Verschiebungen an diesem Tag:",
    ...(moves.length
      ? moves.map((t) => {
          const m = durationMinutes(t);
          return `- ${KIND_LABELS[t.kind]}: ${t.from_place ?? "?"} → ${t.to_place ?? "?"}${m ? `, ${formatDuration(m)}` : ""}`;
        })
      : ["(keine)"]),
    "Schon im Tagesplan:",
    ...((existing ?? []).map((e) => `- ${e.start_time ? String(e.start_time).slice(0, 5) + " " : ""}${e.title}`) || []),
  ];
  const settings = await loadSettings(supabase);
  const res = await suggestDayProgram(lines.join("\n"), { apiKey: settings.anthropicKey, model: settings.model });
  if (!res.ok) return { message: res.message };
  if (res.data.items.length === 0) return { message: "Die KI hat nichts Neues vorgeschlagen." };
  return {
    items: res.data.items.map((i) => ({
      title: i.title,
      start_time: i.plan_b ? null : (i.start_time ?? null),
      end_time: i.plan_b ? null : (i.end_time ?? null),
      description: i.description ?? null,
      plan_b: Boolean(i.plan_b),
    })),
  };
}

export async function applyDaySuggestions(tripId: string, day: string, _prev: DayState, fd: FormData): Promise<DayState> {
  if (!uuid.safeParse(tripId).success || !date.safeParse(day).success) return { message: "Ungültige Angaben." };
  let raw: unknown;
  try {
    raw = JSON.parse(String(fd.get("items") ?? ""));
  } catch {
    return { message: "Die Vorschläge sind nicht mehr gültig." };
  }
  const parsed = z.array(itemSchema).safeParse(raw);
  if (!parsed.success) return { message: "Die Vorschläge sind nicht mehr gültig." };
  const picks = new Set(fd.getAll("pick").map(String));
  const chosen = parsed.data.filter((_, i) => picks.has(String(i)));
  if (chosen.length === 0) return { message: "Es ist nichts ausgewählt." };
  const err = await insertItems(tripId, day, chosen, "ai");
  return err ? { message: err } : null;
}
