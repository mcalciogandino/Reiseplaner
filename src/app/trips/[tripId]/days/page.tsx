import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { dayWarnings, eachDate, placesOnDay, programMinutes, transfersOnDay, type DayItem } from "@/lib/days";
import { DESTINATION_COLUMNS, type Destination } from "@/lib/destinations";
import { createClient } from "@/lib/supabase/server";
import { KIND_LABELS, TRANSFER_COLUMNS, durationMinutes, formatDuration, type Transfer } from "@/lib/transfers";
import { TRIP_COLUMNS, type Trip } from "@/lib/trips";
import { DayCard } from "./day-card";

export const maxDuration = 120;

type Params = Promise<{ tripId: string }>;

export default function DaysPage({ params }: { params: Params }) {
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
  const { data: trip } = await supabase.from("trips").select(TRIP_COLUMNS).eq("id", tripId).maybeSingle<Trip>();
  if (!trip) notFound();

  const [{ data: dests }, { data: legs }, { data: plans, error }] = await Promise.all([
    supabase.from("destinations").select(DESTINATION_COLUMNS).eq("trip_id", tripId).order("sort_order").returns<Destination[]>(),
    supabase.from("transfers").select(TRANSFER_COLUMNS).eq("trip_id", tripId).eq("is_option", false).returns<Transfer[]>(),
    supabase
      .from("day_plans")
      .select("date, day_plan_items(id, title, description, start_time, end_time, plan_b, sort_order)")
      .eq("trip_id", tripId),
  ]);
  const itemsByDate = new Map<string, DayItem[]>(
    (plans ?? []).map((p) => [
      p.date as string,
      [...((p.day_plan_items ?? []) as DayItem[])].sort(
        (a, b) =>
          Number(a.plan_b) - Number(b.plan_b) ||
          (a.start_time ?? "99").localeCompare(b.start_time ?? "99") ||
          a.sort_order - b.sort_order,
      ),
    ]),
  );

  const days = eachDate(trip.start_date, trip.end_date).map((date, i) => {
    const items = itemsByDate.get(date) ?? [];
    const moves = transfersOnDay(legs ?? [], date);
    const travelMin = moves.reduce((s, t) => s + (durationMinutes(t) ?? 0), 0);
    return {
      date,
      number: i + 1,
      places: placesOnDay(dests ?? [], date).map((p) => p.name),
      moves: moves.map((t) => {
        const m = durationMinutes(t);
        return `${KIND_LABELS[t.kind]}: ${t.from_place ?? "?"} → ${t.to_place ?? "?"}${m ? ` (${formatDuration(m)})` : ""}`;
      }),
      items,
      warnings: dayWarnings(travelMin, programMinutes(items)),
    };
  });

  return (
    <>
      <Link href={`/trips/${tripId}`} className="inline-flex min-h-11 items-center text-sm underline">
        ← Zurück zur Reise
      </Link>
      <h1 className="text-2xl font-semibold">Tagesplan · {trip.name}</h1>
      {error && (
        <p role="alert" className="rounded-lg border border-amber-600 p-3 text-sm text-amber-800 dark:text-amber-300">
          Der Tagesplan konnte nicht geladen werden. Führe <code>supabase/catch-up.sql</code> im SQL Editor aus.
        </p>
      )}
      <div className="flex flex-col gap-4">
        {days.map((d) => (
          <DayCard key={d.date} tripId={tripId} day={d} />
        ))}
      </div>
    </>
  );
}
