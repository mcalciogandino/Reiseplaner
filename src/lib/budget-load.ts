import { activityLines, type Status } from "./activities";
import { CATEGORIES, destinationLines, transferLines, vehicleLines, type BudgetLine, type Category } from "./budget";
import type { createClient } from "./supabase/server";
import { KIND_LABELS } from "./transfers";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/**
 * Alle Budgetzeilen einer Reise: automatische (Unterkünfte, Verschiebungen, Aktivitäten, Fahrzeuge)
 * und eigene Posten. Gemeinsame Quelle für die Budget- und die Statistik-Seite, damit beide
 * dieselben Zahlen zeigen.
 */
export async function loadBudgetLines(supabase: Supabase, tripId: string): Promise<{ lines: BudgetLine[]; error: boolean }> {
  const [{ data: dests }, { data: legs }, { data: cars }, { data: acts }, { data: entries, error }] = await Promise.all([
    supabase.from("destinations").select("id, name, kind, lodging_name, lodging_price, lodging_currency").eq("trip_id", tripId),
    supabase.from("transfers").select("id, kind, from_place, to_place, price, currency").eq("trip_id", tripId).eq("is_option", false),
    supabase.from("vehicles").select("id, kind, provider, vehicle_name, price, currency").eq("trip_id", tripId),
    supabase.from("activities").select("id, title, status, estimated_cost, currency").eq("trip_id", tripId),
    supabase
      .from("budget_entries")
      .select("id, category, description, planned_amount, actual_amount, currency, rate_to_base, entry_date")
      .eq("trip_id", tripId)
      .order("created_at"),
  ]);

  const manual: BudgetLine[] = (entries ?? []).map((e) => ({
    key: `m-${e.id}`,
    origin: "manual",
    entryId: e.id as string,
    category: (CATEGORIES as readonly string[]).includes(e.category as string) ? (e.category as Category) : "other",
    description: e.description as string,
    planned: num(e.planned_amount),
    actual: num(e.actual_amount),
    currency: e.currency as string,
    rate: num(e.rate_to_base),
    date: (e.entry_date as string | null) ?? null,
  }));
  const auto = [
    ...destinationLines((dests ?? []).map((d) => ({ ...d, lodging_price: num(d.lodging_price) }))),
    ...transferLines(
      (legs ?? []).map((t) => ({ ...t, price: num(t.price) })),
      (k) => KIND_LABELS[k as keyof typeof KIND_LABELS] ?? k,
    ),
    ...activityLines((acts ?? []).map((a) => ({ ...a, status: a.status as Status, estimated_cost: num(a.estimated_cost) }))),
    ...vehicleLines((cars ?? []).map((v) => ({ ...v, price: num(v.price) }))),
  ];
  return { lines: [...auto, ...manual], error: Boolean(error) };
}
