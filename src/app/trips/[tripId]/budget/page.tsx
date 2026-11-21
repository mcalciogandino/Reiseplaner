import Link from "next/link";
import { VariantBar } from "../variants/variant-bar";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { summarize } from "@/lib/budget";
import { loadBudgetLines } from "@/lib/budget-load";
import { fetchRates } from "@/lib/fx";
import { createClient } from "@/lib/supabase/server";
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

  const { lines, error } = await loadBudgetLines(supabase, tripId);
  const base = (trip.base_currency as string) || "CHF";

  const { rates, failed } = await fetchRates(lines.map((l) => l.currency), base);
  // Eigene Kurse einzelner Posten haben Vorrang; für die Zusammenfassung zählen sie über line.rate.
  const summary = summarize(lines, base, rates);

  return (
    <>
      <VariantBar tripId={tripId} suffix="/budget" />
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
