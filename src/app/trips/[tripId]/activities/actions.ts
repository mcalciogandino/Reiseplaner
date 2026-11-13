"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ACTIVITY_COLUMNS, PRIORITIES, STATUSES, type Activity } from "@/lib/activities";
import { suggestIdeas } from "@/lib/ai/claude";
import { loadSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";

export type ActState = { message: string } | null;
export type IdeaSuggestions = {
  message?: string;
  items?: { title: string; description: string | null; estimated_cost: number | null; currency: string; needs_reservation: boolean; destination_id: string | null; place: string | null }[];
} | null;

const uuid = z.uuid();
const date = z.iso.date();
const cost = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d{1,8}([.,]\d{1,2})?$/.test(v), "Bitte Kosten wie 120 oder 119.90 eingeben.")
  .transform((v) => (v === "" ? null : Number(v.replace(",", "."))));

const actSchema = z.object({
  title: z.string().trim().min(1, "Bitte einen Titel eingeben.").max(150, "Maximal 150 Zeichen."),
  description: z.string().trim().max(500, "Maximal 500 Zeichen.").transform((v) => v || null),
  destination_id: z.union([z.literal(""), z.uuid()]).transform((v) => v || null),
  priority: z.enum(PRIORITIES),
  estimated_cost: cost,
  currency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/, "Bitte die Währung mit drei Buchstaben angeben, z. B. CAD.")
    .transform((v) => v.toUpperCase()),
  url: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === "" || /^https?:\/\//i.test(v), "Der Link muss mit http:// oder https:// beginnen.")
    .transform((v) => v || null),
  needs_reservation: z.boolean(),
});

function readAct(fd: FormData) {
  return actSchema.safeParse({
    title: fd.get("title") ?? "",
    description: fd.get("description") ?? "",
    destination_id: fd.get("destination_id") ?? "",
    priority: fd.get("priority") ?? "medium",
    estimated_cost: fd.get("estimated_cost") ?? "",
    currency: fd.get("currency") ?? "CAD",
    url: fd.get("url") ?? "",
    needs_reservation: fd.get("needs_reservation") === "on",
  });
}

const refresh = (tripId: string) => {
  revalidatePath(`/trips/${tripId}/activities`);
  revalidatePath(`/trips/${tripId}/budget`);
  revalidatePath(`/trips/${tripId}/days`);
};

export async function addActivity(tripId: string, _prev: ActState, fd: FormData): Promise<ActState> {
  if (!uuid.safeParse(tripId).success) return { message: "Ungültige Reise." };
  const parsed = readAct(fd);
  if (!parsed.success) return { message: parsed.error.issues[0].message };
  const voter = String(fd.get("voter") ?? "").trim().slice(0, 40) || null;
  const supabase = await createClient();
  const { error } = await supabase.from("activities").insert({ trip_id: tripId, ...parsed.data, created_by: voter, source: "user" });
  if (error) {
    console.error("addActivity failed:", error.code);
    return { message: "Die Idee konnte nicht gespeichert werden." };
  }
  refresh(tripId);
  return null;
}

export async function updateActivity(tripId: string, id: string, _prev: ActState, fd: FormData): Promise<ActState> {
  if (!uuid.safeParse(tripId).success || !uuid.safeParse(id).success) return { message: "Ungültige Angaben." };
  const parsed = readAct(fd);
  if (!parsed.success) return { message: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.from("activities").update(parsed.data).eq("id", id).eq("trip_id", tripId);
  if (error) {
    console.error("updateActivity failed:", error.code);
    return { message: "Das Speichern ist fehlgeschlagen." };
  }
  refresh(tripId);
  return null;
}

export async function setStatus(tripId: string, id: string, status: string) {
  const s = z.enum(STATUSES).safeParse(status);
  if (!uuid.safeParse(tripId).success || !uuid.safeParse(id).success || !s.success) return;
  const supabase = await createClient();
  await supabase.from("activities").update({ status: s.data }).eq("id", id).eq("trip_id", tripId);
  refresh(tripId);
}

export async function deleteActivity(tripId: string, id: string) {
  if (!uuid.safeParse(tripId).success || !uuid.safeParse(id).success) return;
  const supabase = await createClient();
  await supabase.from("activities").delete().eq("id", id).eq("trip_id", tripId);
  refresh(tripId);
}

/** Stimme setzen oder zurücknehmen (ein gemeinsames Konto, daher nach Name). */
export async function toggleVote(tripId: string, id: string, voter: string) {
  const name = voter.trim().slice(0, 40);
  if (!uuid.safeParse(tripId).success || !uuid.safeParse(id).success || !name) return;
  const supabase = await createClient();
  const { data: act } = await supabase.from("activities").select("id").eq("id", id).eq("trip_id", tripId).maybeSingle();
  if (!act) return;
  const { data: existing } = await supabase
    .from("activity_votes")
    .select("voter")
    .eq("activity_id", id)
    .eq("voter", name)
    .maybeSingle();
  if (existing) await supabase.from("activity_votes").delete().eq("activity_id", id).eq("voter", name);
  else await supabase.from("activity_votes").insert({ activity_id: id, voter: name });
  refresh(tripId);
}

/** Aktivität als Punkt in den Tagesplan übernehmen und als «geplant» markieren. */
export async function addToDay(tripId: string, id: string, _prev: ActState, fd: FormData): Promise<ActState> {
  const day = date.safeParse(fd.get("day"));
  if (!uuid.safeParse(tripId).success || !uuid.safeParse(id).success || !day.success) return { message: "Bitte einen Tag wählen." };
  const supabase = await createClient();
  const { data: act } = await supabase.from("activities").select("id, title, description").eq("id", id).eq("trip_id", tripId).maybeSingle();
  if (!act) return { message: "Aktivität nicht gefunden." };
  const { data: trip } = await supabase.from("trips").select("start_date, end_date").eq("id", tripId).maybeSingle();
  if (!trip || day.data < (trip.start_date as string) || day.data > (trip.end_date as string)) {
    return { message: "Der Tag liegt ausserhalb der Reise." };
  }
  const { data: plan, error: planErr } = await supabase
    .from("day_plans")
    .upsert({ trip_id: tripId, date: day.data }, { onConflict: "trip_id,date" })
    .select("id")
    .single();
  if (planErr || !plan) {
    console.error("addToDay plan failed:", planErr?.code);
    return { message: "Der Tag konnte nicht angelegt werden." };
  }
  const { data: last } = await supabase
    .from("day_plan_items")
    .select("sort_order")
    .eq("day_plan_id", plan.id)
    .order("sort_order", { ascending: false })
    .limit(1);
  const { error } = await supabase.from("day_plan_items").insert({
    day_plan_id: plan.id,
    activity_id: act.id,
    title: act.title,
    description: act.description,
    sort_order: ((last?.[0]?.sort_order as number | undefined) ?? -1) + 1,
    source: "user",
    reviewed: true,
  });
  if (error) {
    console.error("addToDay failed:", error.code);
    return { message: "Das Speichern ist fehlgeschlagen." };
  }
  await supabase.from("activities").update({ status: "planned" }).eq("id", id).eq("trip_id", tripId).eq("status", "idea");
  refresh(tripId);
  return null;
}

export async function suggestActivityIdeas(tripId: string): Promise<IdeaSuggestions> {
  if (!uuid.safeParse(tripId).success) return { message: "Ungültige Reise." };
  const supabase = await createClient();
  const [{ data: trip }, { data: dests }, { data: acts }] = await Promise.all([
    supabase.from("trips").select("name, start_date, end_date, base_currency").eq("id", tripId).maybeSingle(),
    supabase.from("destinations").select("id, name, kind, arrival_date, departure_date").eq("trip_id", tripId).order("sort_order"),
    supabase.from("activities").select(ACTIVITY_COLUMNS).eq("trip_id", tripId).returns<Activity[]>(),
  ]);
  if (!trip) return { message: "Reise nicht gefunden." };
  const context = [
    `Reise: ${trip.name}, ${trip.start_date} bis ${trip.end_date}.`,
    "Reiseorte:",
    ...(dests ?? []).map((d) => `- ${d.name} (${d.arrival_date ?? "?"} bis ${d.departure_date ?? "?"})`),
    "Schon auf der Liste:",
    ...((acts ?? []).length ? (acts ?? []).map((a) => `- ${a.title}`) : ["(nichts)"]),
  ].join("\n");
  const settings = await loadSettings(supabase);
  const res = await suggestIdeas(context, { apiKey: settings.anthropicKey, model: settings.model });
  if (!res.ok) return { message: res.message };
  if (res.data.items.length === 0) return { message: "Die KI hat nichts Neues vorgeschlagen." };
  const byName = new Map((dests ?? []).map((d) => [String(d.name).toLowerCase(), d.id as string]));
  return {
    items: res.data.items.map((i) => ({
      title: i.title,
      description: i.description ?? null,
      estimated_cost: i.estimated_cost ?? null,
      currency: (i.currency ?? "CAD").toUpperCase(),
      needs_reservation: Boolean(i.needs_reservation),
      destination_id: i.place ? (byName.get(i.place.toLowerCase()) ?? null) : null,
      place: i.place ?? null,
    })),
  };
}

const ideaSchema = z.array(
  z.object({
    title: z.string().trim().min(1).max(150),
    description: z.string().trim().max(500).nullable(),
    estimated_cost: z.number().min(0).max(100_000).nullable(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    needs_reservation: z.boolean(),
    destination_id: z.uuid().nullable(),
  }),
);

export async function applyIdeas(tripId: string, _prev: ActState, fd: FormData): Promise<ActState> {
  if (!uuid.safeParse(tripId).success) return { message: "Ungültige Reise." };
  let raw: unknown;
  try {
    raw = JSON.parse(String(fd.get("items") ?? ""));
  } catch {
    return { message: "Die Vorschläge sind nicht mehr gültig." };
  }
  const parsed = ideaSchema.safeParse(raw);
  if (!parsed.success) return { message: "Die Vorschläge sind nicht mehr gültig." };
  const picks = new Set(fd.getAll("pick").map(String));
  const chosen = parsed.data.filter((_, i) => picks.has(String(i)));
  if (chosen.length === 0) return { message: "Es ist nichts ausgewählt." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("activities")
    .insert(chosen.map((c) => ({ trip_id: tripId, ...c, source: "ai", reviewed: true })));
  if (error) {
    console.error("applyIdeas failed:", error.code);
    return { message: "Das Speichern ist fehlgeschlagen." };
  }
  refresh(tripId);
  return null;
}
