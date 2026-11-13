import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { ACTIVITY_COLUMNS, sortActivities, type Activity } from "@/lib/activities";
import { eachDate } from "@/lib/days";
import { createClient } from "@/lib/supabase/server";
import { TRIP_COLUMNS, type Trip } from "@/lib/trips";
import { ActivitiesView } from "./activities-view";

export const maxDuration = 120;

type Params = Promise<{ tripId: string }>;

export default function ActivitiesPage({ params }: { params: Params }) {
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

  const [{ data: dests }, { data: acts, error }, { data: votes }] = await Promise.all([
    supabase.from("destinations").select("id, name").eq("trip_id", tripId).order("sort_order"),
    supabase.from("activities").select(ACTIVITY_COLUMNS).eq("trip_id", tripId).order("created_at"),
    supabase.from("activity_votes").select("activity_id, voter"),
  ]);
  const votersBy = new Map<string, string[]>();
  for (const v of votes ?? []) {
    const id = v.activity_id as string;
    votersBy.set(id, [...(votersBy.get(id) ?? []), v.voter as string]);
  }
  const items = sortActivities(
    ((acts ?? []) as Activity[]).map((a) => ({
      ...a,
      estimated_cost: a.estimated_cost === null ? null : Number(a.estimated_cost),
      voters: votersBy.get(a.id) ?? [],
      votes: (votersBy.get(a.id) ?? []).length,
    })),
  );

  return (
    <>
      <Link href={`/trips/${tripId}`} className="inline-flex min-h-11 items-center text-sm underline">
        ← Zurück zur Reise
      </Link>
      <h1 className="text-2xl font-semibold">Bucket List · {trip.name}</h1>
      {error && (
        <p role="alert" className="rounded-lg border border-amber-600 p-3 text-sm text-amber-800 dark:text-amber-300">
          Die Liste konnte nicht geladen werden.
        </p>
      )}
      <ActivitiesView
        tripId={tripId}
        items={items}
        places={(dests ?? []).map((d) => ({ id: d.id as string, name: d.name as string }))}
        days={eachDate(trip.start_date, trip.end_date)}
      />
    </>
  );
}
