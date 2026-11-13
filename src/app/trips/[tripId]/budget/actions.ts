"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { suggestBudget } from "@/lib/ai/claude";
import { CATEGORIES, CATEGORY_LABELS, destinationLines, transferLines, vehicleLines } from "@/lib/budget";
import { loadSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { KIND_LABELS } from "@/lib/transfers";

export type BudgetState = { message: string } | null;
export type BudgetSuggestions = {
  message?: string;
  items?: { category: string; description: string; planned_amount: number; currency: string }[];
} | null;

const uuid = z.uuid();
const amount = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d{1,8}([.,]\d{1,2})?$/.test(v), "Bitte Beträge wie 120 oder 119.90 eingeben.")
  .transform((v) => (v === "" ? null : Number(v.replace(",", "."))));
const currency = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{3}$/, "Bitte die Währung mit drei Buchstaben angeben, z. B. CAD.")
  .transform((v) => v.toUpperCase());

const entrySchema = z
  .object({
    category: z.enum(CATEGORIES),
    description: z.string().trim().min(1, "Bitte eine Beschreibung eingeben.").max(150, "Maximal 150 Zeichen."),
    planned_amount: amount,
    actual_amount: amount,
    currency,
    entry_date: z.union([z.literal(""), z.iso.date()]).transform((v) => v || null),
  })
  .refine((v) => v.planned_amount !== null || v.actual_amount !== null, {
    message: "Bitte einen geplanten oder tatsächlichen Betrag eingeben.",
    path: ["planned_amount"],
  });

export async function addEntry(tripId: string, _prev: BudgetState, fd: FormData): Promise<BudgetState> {
  if (!uuid.safeParse(tripId).success) return { message: "Ungültige Reise." };
  const parsed = entrySchema.safeParse({
    category: fd.get("category") ?? "",
    description: fd.get("description") ?? "",
    planned_amount: fd.get("planned_amount") ?? "",
    actual_amount: fd.get("actual_amount") ?? "",
    currency: fd.get("currency") ?? "CAD",
    entry_date: fd.get("entry_date") ?? "",
  });
  if (!parsed.success) return { message: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.from("budget_entries").insert({ trip_id: tripId, ...parsed.data });
  if (error) {
    console.error("addEntry failed:", error.code);
    return { message: "Der Posten konnte nicht gespeichert werden." };
  }
  revalidatePath(`/trips/${tripId}/budget`);
  return null;
}

export async function deleteEntry(tripId: string, entryId: string) {
  if (!uuid.safeParse(tripId).success || !uuid.safeParse(entryId).success) return;
  const supabase = await createClient();
  await supabase.from("budget_entries").delete().eq("id", entryId).eq("trip_id", tripId);
  revalidatePath(`/trips/${tripId}/budget`);
}

/** Gesamtbudget und Basiswährung der Reise. */
export async function saveTotals(tripId: string, _prev: BudgetState, fd: FormData): Promise<BudgetState> {
  if (!uuid.safeParse(tripId).success) return { message: "Ungültige Reise." };
  const total = amount.safeParse(fd.get("total_budget") ?? "");
  const base = currency.safeParse(fd.get("base_currency") ?? "CHF");
  if (!total.success || !base.success) return { message: (total.error ?? base.error)!.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase
    .from("trips")
    .update({ total_budget: total.data, base_currency: base.data })
    .eq("id", tripId);
  if (error) {
    console.error("saveTotals failed:", error.code);
    return { message: "Das Budget konnte nicht gespeichert werden." };
  }
  revalidatePath(`/trips/${tripId}/budget`);
  return null;
}

/** KI schätzt fehlende Posten; gespeichert wird erst nach der Auswahl. */
export async function suggestEntries(tripId: string): Promise<BudgetSuggestions> {
  if (!uuid.safeParse(tripId).success) return { message: "Ungültige Reise." };
  const supabase = await createClient();
  const [{ data: trip }, { data: dests }, { data: legs }, { data: cars }, { data: manual }] = await Promise.all([
    supabase.from("trips").select("name, start_date, end_date, base_currency").eq("id", tripId).maybeSingle(),
    supabase
      .from("destinations")
      .select("id, name, kind, lodging_name, lodging_price, lodging_currency, arrival_date, departure_date")
      .eq("trip_id", tripId)
      .order("sort_order"),
    supabase.from("transfers").select("id, kind, from_place, to_place, price, currency").eq("trip_id", tripId).eq("is_option", false),
    supabase.from("vehicles").select("id, kind, provider, vehicle_name, price, currency").eq("trip_id", tripId),
    supabase.from("budget_entries").select("category, description, planned_amount, actual_amount, currency").eq("trip_id", tripId),
  ]);
  if (!trip) return { message: "Reise nicht gefunden." };

  const lines = [
    ...destinationLines(dests ?? []),
    ...transferLines(legs ?? [], (k) => KIND_LABELS[k as keyof typeof KIND_LABELS] ?? k),
    ...vehicleLines(cars ?? []),
  ];
  const context = [
    `Reise: ${trip.name}, ${trip.start_date} bis ${trip.end_date}.`,
    "Orte:",
    ...(dests ?? []).map((d) => `- ${d.name} [${d.kind}] ${d.arrival_date ?? "?"} bis ${d.departure_date ?? "?"}`),
    "Schon im Budget (automatisch aus Buchungen):",
    ...(lines.length ? lines.map((l) => `- ${CATEGORY_LABELS[l.category]}: ${l.description}, ${l.planned} ${l.currency}`) : ["(nichts)"]),
    "Schon im Budget (von Hand):",
    ...((manual ?? []).length
      ? (manual ?? []).map((m) => `- ${m.category}: ${m.description}, ${m.planned_amount ?? m.actual_amount} ${m.currency}`)
      : ["(nichts)"]),
  ].join("\n");

  const settings = await loadSettings(supabase);
  const res = await suggestBudget(context, { apiKey: settings.anthropicKey, model: settings.model });
  if (!res.ok) return { message: res.message };
  if (res.data.items.length === 0) return { message: "Die KI hat keine weiteren Posten vorgeschlagen." };
  return {
    items: res.data.items.map((i) => ({
      category: i.category,
      description: i.description,
      planned_amount: i.planned_amount,
      currency: (i.currency ?? "CAD").toUpperCase(),
    })),
  };
}

const applySchema = z.array(
  z.object({
    category: z.enum(CATEGORIES),
    description: z.string().trim().min(1).max(150),
    planned_amount: z.number().min(0).max(1_000_000),
    currency,
  }),
);

export async function applyEntries(tripId: string, _prev: BudgetState, fd: FormData): Promise<BudgetState> {
  if (!uuid.safeParse(tripId).success) return { message: "Ungültige Reise." };
  let raw: unknown;
  try {
    raw = JSON.parse(String(fd.get("items") ?? ""));
  } catch {
    return { message: "Die Vorschläge sind nicht mehr gültig." };
  }
  const parsed = applySchema.safeParse(raw);
  if (!parsed.success) return { message: "Die Vorschläge sind nicht mehr gültig." };
  const picks = new Set(fd.getAll("pick").map(String));
  const rows = parsed.data
    .filter((_, i) => picks.has(String(i)))
    .map((i) => ({ trip_id: tripId, ...i, source: "ai", reviewed: true }));
  if (rows.length === 0) return { message: "Es ist nichts ausgewählt." };
  const supabase = await createClient();
  const { error } = await supabase.from("budget_entries").insert(rows);
  if (error) {
    console.error("applyEntries failed:", error.code);
    return { message: "Das Speichern ist fehlgeschlagen." };
  }
  revalidatePath(`/trips/${tripId}/budget`);
  return null;
}

