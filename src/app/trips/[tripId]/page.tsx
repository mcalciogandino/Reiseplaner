import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { Card } from "@/components/ui/card";
import { DbErrorNotice, dbErrorMessage } from "@/components/db-error";
import { Timeline } from "@/components/timeline";
import { ReviewCard } from "./review-card";
import { DESTINATION_COLUMNS, type Destination } from "@/lib/destinations";
import { routeWarnings } from "@/lib/route-warnings";
import { createClient } from "@/lib/supabase/server";
import { buildTimeline } from "@/lib/timeline";
import { formatDate, formatRoute, TRIP_COLUMNS, tripDays, type Trip } from "@/lib/trips";
import { TRANSFER_COLUMNS, type Transfer } from "@/lib/transfers";

// Die KI-Prüfung braucht einige Sekunden.
export const maxDuration = 120;

const linkButton =
  "inline-flex min-h-11 items-center rounded-lg border border-neutral-300 px-4 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800";

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
  const { data: trip } = await supabase
    .from("trips")
    .select(TRIP_COLUMNS)
    .eq("id", tripId)
    .maybeSingle<Trip>();
  if (!trip) notFound();

  const { data: stops, error: stopsError } = await supabase
    .from("destinations")
    .select(DESTINATION_COLUMNS)
    .eq("trip_id", tripId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .returns<Destination[]>();
  const destinations = stops ?? [];
  const { data: legs, error: legsError } = await supabase
    .from("transfers")
    .select(TRANSFER_COLUMNS)
    .eq("trip_id", tripId)
    .order("depart_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .returns<Transfer[]>();
  const allLegs = legs ?? [];
  const transfers = allLegs.filter((t) => !t.is_option);
  // Alternativen je Verbindung (gleiche option_group), für die Anzeige unter der gewählten Verbindung.
  const options = new Map<string, Transfer[]>();
  for (const t of allLegs) {
    if (t.is_option && t.option_group) options.set(t.option_group, [...(options.get(t.option_group) ?? []), t]);
  }
  const loadError = dbErrorMessage(stopsError, legsError);
  const nodes = buildTimeline(destinations, transfers);
  const warnings = routeWarnings(trip, destinations);

  return (
    <>
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{trip.name}</h1>
          <p className="mt-1 text-neutral-600 dark:text-neutral-400">{formatRoute(trip)}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link href={`/trips/${tripId}/budget`} className={linkButton}>
            Budget
          </Link>
          <Link href={`/trips/${tripId}/vehicles`} className={linkButton}>
            Fahrzeuge
          </Link>
          <Link href={`/trips/${tripId}/days`} className={linkButton}>
            Tagesplan
          </Link>
          <Link href={`/trips/${tripId}/checklist`} className={linkButton}>
            Checkliste
          </Link>
          <Link href={`/trips/${tripId}/map`} className={linkButton}>
            Karte
          </Link>
          <Link href={`/trips/${tripId}/edit`} className={linkButton}>
            Bearbeiten
          </Link>
        </div>
      </header>

      <Card>
        <dl className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="text-neutral-500">Start</dt>
            <dd className="font-medium">{formatDate(trip.start_date)}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Ende</dt>
            <dd className="font-medium">{formatDate(trip.end_date)}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Dauer</dt>
            <dd className="font-medium">{tripDays(trip.start_date, trip.end_date)} Tage</dd>
          </div>
        </dl>
      </Card>

      <section className="flex flex-col gap-3" aria-labelledby="zeitleiste">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="zeitleiste" className="text-lg font-semibold">Zeitleiste</h2>
          <div className="flex gap-2">
            <Link href={`/trips/${tripId}/destinations/new`} className={linkButton}>
              Ort hinzufügen
            </Link>
            <Link href={`/trips/${tripId}/transfers/new`} className={linkButton}>
              Verschiebung hinzufügen
            </Link>
          </div>
        </div>

        {warnings.length > 0 && (
          <div role="status" className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
            <ul className="list-disc pl-5">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {loadError && <DbErrorNotice message={loadError} />}

        {loadError ? null : nodes.length === 0 ? (
          <Card>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Noch nichts erfasst. Füge Orte und Verschiebungen (Flüge, Mietwagen, Fähren, Fahrten) hinzu.
              Sie erscheinen hier in zeitlicher Reihenfolge.
            </p>
            <Link href={`/trips/${tripId}/ai`} className="mt-3 inline-flex min-h-11 items-center gap-2 underline">
              Oder beschreibe es der KI in einem Text
            </Link>
          </Card>
        ) : (
          <Timeline tripId={tripId} startDate={trip.start_date} nodes={nodes} destinations={destinations} options={options} />
        )}
      </section>

      <ReviewCard tripId={tripId} />

      <Card>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Hier folgen Bucket List, Tagesplan und Budget dieser Reise.
        </p>
      </Card>
    </>
  );
}
