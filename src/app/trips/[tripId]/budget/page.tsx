import Link from "next/link";
import { activityLines, type Status } from "@/lib/activities";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import {
  CATEGORIES,
  destinationLines,
  summarize,
  transferLines,
  vehicleLines,
  type BudgetLine,
  type Category,
} from "@/lib/budget";
import { fetchRates } from "@/lib/fx";
import { createClient } from "@/lib/supabase/server";
import { KIND_LABELS } from "@/lib/transfers";
import { BudgetView } from "./budget-view";

export const maxDuration = 120;

type Params = Promise<{ tripId: string }>;

export default function BudgetPage({ params }: { params: Params }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
      <Suspense fallback={<p>Lädt …</p>}>
        <Content params={params} />
      </Suspense>
    </main>
  );
}

async function Content({ params }: { params: Params }) {
  const { tripId } = await params;
  if (!z.uuid().safeParse(tripId).success) notFound();
  const supabase = await createClient();
  const { data: trip } = await supabase
    .from("trips")
    .select("name, total_budget, base_currency")
    .eq("id", tripId)
    .maybeSingle();
  if (!trip) notFound();

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
    planned: e.planned_amount === null ? null : Number(e.planned_amount),
    actual: e.actual_amount === null ? null : Number(e.actual_amount),
    currency: e.currency as string,
    rate: e.rate_to_base === null ? null : Number(e.rate_to_base),
    date: (e.entry_date as string | null) ?? null,
  }));
  const auto = [
    ...destinationLines((dests ?? []).map((d) => ({ ...d, lodging_price: d.lodging_price === null ? null : Number(d.lodging_price) }))),
    ...transferLines(
      (legs ?? []).map((t) => ({ ...t, price: t.price === null ? null : Number(t.price) })),
      (k) => KIND_LABELS[k as keyof typeof KIND_LABELS] ?? k,
    ),
    ...activityLines((acts ?? []).map((a) => ({ ...a, status: a.status as Status, estimated_cost: a.estimated_cost === null ? null : Number(a.estimated_cost) }))),
    ...vehicleLines((cars ?? []).map((v) => ({ ...v, price: v.price === null ? null : Number(v.price) }))),
  ];
  const lines = [...auto, ...manual];
  const base = (trip.base_currency as string) || "CHF";

  const { rates, failed } = await fetchRates(lines.map((l) => l.currency), base);
  // Eigene Kurse einzelner Posten haben Vorrang; für die Zusammenfassung zählen sie über line.rate.
  const summary = summarize(lines, base, rates);

  return (
    <>
      <Link href={`/trips/${tripId}`} className="inline-flex min-h-11 items-center text-sm underline">
        ← Zurück zur Reise
      </Link>
      <h1 className="text-2xl font-semibold">Budget · {trip.name}</h1>
      {error && (
        <p role="alert" className="rounded-lg border border-amber-600 p-3 text-sm text-amber-800 dark:text-amber-300">
          Das Budget konnte nicht geladen werden. Führe <code>supabase/catch-up.sql</code> im SQL Editor aus.
        </p>
      )}
      <BudgetView
        tripId={tripId}
        base={base}
        totalBudget={trip.total_budget === null ? null : Number(trip.total_budget)}
        lines={lines}
        summary={summary}
        rates={rates}
        failedRates={failed}
      />
    </>
  );
}
