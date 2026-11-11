import { differenceInCalendarDays, parseISO } from "date-fns";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { Card } from "@/components/ui/card";
import { DESTINATION_COLUMNS, TIMEZONES, type Destination } from "@/lib/destinations";
import { routeWarnings } from "@/lib/route-warnings";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatRoute, TRIP_COLUMNS, tripDays, type Trip } from "@/lib/trips";
import {
  durationMinutes,
  formatDuration,
  formatLocal,
  KIND_LABELS,
  TRANSFER_COLUMNS,
  type Transfer,
} from "@/lib/transfers";
import { moveDestination } from "./destinations/actions";

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

  const { data: stops } = await supabase
    .from("destinations")
    .select(DESTINATION_COLUMNS)
    .eq("trip_id", tripId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .returns<Destination[]>();
  const destinations = stops ?? [];
  const { data: legs } = await supabase
    .from("transfers")
    .select(TRANSFER_COLUMNS)
    .eq("trip_id", tripId)
    .order("depart_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .returns<Transfer[]>();
  const transfers = legs ?? [];
  const stopName = new Map(destinations.map((d) => [d.id, d.name]));
  const warnings = routeWarnings(trip, destinations);

  return (
    <>
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{trip.name}</h1>
          <p className="mt-1 text-neutral-600 dark:text-neutral-400">{formatRoute(trip)}</p>
        </div>
        <Link href={`/trips/${tripId}/edit`} className={linkButton}>
          Bearbeiten
        </Link>
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

      <section className="flex flex-col gap-3" aria-labelledby="orte">
        <div className="flex items-center justify-between gap-3">
          <h2 id="orte" className="text-lg font-semibold">Reiseorte</h2>
          <Link href={`/trips/${tripId}/destinations/new`} className={linkButton}>
            Ort hinzufügen
          </Link>
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

        {destinations.length === 0 ? (
          <Card>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Noch keine Orte. Füge die Stationen der Reise in der Reihenfolge der Route hinzu.
            </p>
          </Card>
        ) : (
          <ol className="flex flex-col gap-3">
            {destinations.map((d, i) => (
              <li key={d.id}>
                <Card className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-700 text-sm font-medium text-white">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/trips/${tripId}/destinations/${d.id}`} className="font-semibold underline-offset-2 hover:underline">
                      {d.name}
                    </Link>
                    <StopDetails d={d} />
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <MoveButton tripId={tripId} destId={d.id} direction="up" disabled={i === 0} />
                    <MoveButton tripId={tripId} destId={d.id} direction="down" disabled={i === destinations.length - 1} />
                  </div>
                </Card>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="verschiebungen">
        <div className="flex items-center justify-between gap-3">
          <h2 id="verschiebungen" className="text-lg font-semibold">Flüge und Verschiebungen</h2>
          <Link href={`/trips/${tripId}/transfers/new`} className={linkButton}>
            Hinzufügen
          </Link>
        </div>
        {transfers.length === 0 ? (
          <Card>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Noch nichts erfasst. Trage Flüge, Mietwagen, Fähren und Fahrten zwischen den Orten ein.
            </p>
          </Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {transfers.map((t) => (
              <li key={t.id}>
                <Link href={`/trips/${tripId}/transfers/${t.id}`} className="block">
                  <Card className="transition-colors hover:border-red-700">
                    <TransferSummary t={t} stopName={stopName} />
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Card>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Hier folgen Bucket List, Tagesplan und Budget dieser Reise.
        </p>
      </Card>
    </>
  );
}

function StopDetails({ d }: { d: Destination }) {
  const tz = TIMEZONES.find((t) => t.value === d.timezone)?.label;
  const n =
    d.arrival_date && d.departure_date
      ? differenceInCalendarDays(parseISO(d.departure_date), parseISO(d.arrival_date))
      : null;
  return (
    <div className="mt-1 space-y-0.5 text-sm text-neutral-600 dark:text-neutral-400">
      {d.arrival_date || d.departure_date ? (
        <p>
          {d.arrival_date ? formatDate(d.arrival_date) : "?"} –{" "}
          {d.departure_date ? formatDate(d.departure_date) : "?"}
          {n !== null && ` · ${n === 1 ? "1 Nacht" : `${n} Nächte`}`}
        </p>
      ) : (
        <p>Daten noch offen</p>
      )}
      {d.lodging_name ? (
        <p>
          Unterkunft: {d.lodging_name}
          {d.lodging_checkin && ` (Check-in ab ${d.lodging_checkin.slice(0, 5)})`}
        </p>
      ) : (
        <p>Noch keine Unterkunft</p>
      )}
      {tz && <p>{tz}</p>}
    </div>
  );
}

function MoveButton({
  tripId,
  destId,
  direction,
  disabled,
}: {
  tripId: string;
  destId: string;
  direction: "up" | "down";
  disabled: boolean;
}) {
  return (
    <form action={moveDestination.bind(null, tripId, destId, direction)}>
      <button
        type="submit"
        disabled={disabled}
        aria-label={direction === "up" ? "Nach oben" : "Nach unten"}
        className="flex h-11 w-11 items-center justify-center rounded-lg border border-neutral-300 hover:bg-neutral-100 disabled:opacity-30 dark:border-neutral-700 dark:hover:bg-neutral-800"
      >
        {direction === "up" ? "↑" : "↓"}
      </button>
    </form>
  );
}

function TransferSummary({ t, stopName }: { t: Transfer; stopName: Map<string, string> }) {
  const from = (t.from_destination_id && stopName.get(t.from_destination_id)) || t.from_place;
  const to = (t.to_destination_id && stopName.get(t.to_destination_id)) || t.to_place;
  const route = [from, to].filter(Boolean).join(" → ");
  const minutes = durationMinutes(t);
  const facts = [
    t.carrier,
    t.flight_number,
    minutes !== null && minutes >= 0 ? formatDuration(minutes) : null,
    t.distance_km !== null ? `${t.distance_km} km` : null,
    t.booking_ref ? `Buchung ${t.booking_ref}` : null,
  ].filter(Boolean);

  return (
    <>
      <h3 className="font-semibold">
        {KIND_LABELS[t.kind]}
        {route && <span className="font-normal"> · {route}</span>}
      </h3>
      <div className="mt-1 space-y-0.5 text-sm text-neutral-600 dark:text-neutral-400">
        {t.depart_at && t.depart_tz ? (
          <p>Abfahrt {formatLocal(t.depart_at, t.depart_tz)} (Ortszeit)</p>
        ) : (
          <p>Abfahrt noch offen</p>
        )}
        {t.arrive_at && t.arrive_tz && (
          <p>Ankunft {formatLocal(t.arrive_at, t.arrive_tz)} (Ortszeit)</p>
        )}
        {facts.length > 0 && <p>{facts.join(" · ")}</p>}
      </div>
    </>
  );
}
