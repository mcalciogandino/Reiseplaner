import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatRoute, TRIP_COLUMNS, tripDays, type Trip } from "@/lib/trips";

export default function TripPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
      <Link href="/" className="inline-flex min-h-11 items-center text-sm underline">
        ← Alle Reisen
      </Link>
      <Suspense fallback={<p>Lädt …</p>}>
        <TripOverview params={params} />
      </Suspense>
    </main>
  );
}

async function TripOverview({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  if (!z.uuid().safeParse(tripId).success) notFound();

  const supabase = await createClient();
  // RLS: Eine fremde oder unbekannte Reise liefert keine Zeile.
  const { data } = await supabase
    .from("trips")
    .select(TRIP_COLUMNS)
    .eq("id", tripId)
    .maybeSingle<Trip>();
  if (!data) notFound();

  return (
    <>
      <header>
        <h1 className="text-2xl font-semibold">{data.name}</h1>
        <p className="mt-1 text-neutral-600 dark:text-neutral-400">
          {formatRoute(data)}
        </p>
      </header>
      <Card>
        <dl className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="text-neutral-500">Start</dt>
            <dd className="font-medium">{formatDate(data.start_date)}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Ende</dt>
            <dd className="font-medium">{formatDate(data.end_date)}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Dauer</dt>
            <dd className="font-medium">
              {tripDays(data.start_date, data.end_date)} Tage
            </dd>
          </div>
        </dl>
      </Card>
      <Card>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Hier folgen Reiseorte, Verschiebungen, Bucket List, Tagesplan und
          Budget dieser Reise.
        </p>
      </Card>
    </>
  );
}
