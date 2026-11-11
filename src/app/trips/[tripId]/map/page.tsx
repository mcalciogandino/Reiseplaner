import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { DbErrorNotice, dbErrorMessage } from "@/components/db-error";
import { Card } from "@/components/ui/card";
import { DESTINATION_COLUMNS, type Destination } from "@/lib/destinations";
import { buildMapData } from "@/lib/map";
import { createClient } from "@/lib/supabase/server";
import { TRANSFER_COLUMNS, type Transfer } from "@/lib/transfers";
import { TRIP_COLUMNS, type Trip } from "@/lib/trips";
import { TripMap } from "./trip-map";

type Params = Promise<{ tripId: string }>;

export default function MapPage({ params }: { params: Params }) {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 p-4">
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
    .select(TRIP_COLUMNS)
    .eq("id", tripId)
    .maybeSingle<Trip>();
  if (!trip) notFound();

  const [{ data: stops, error: stopsError }, { data: legs, error: legsError }] = await Promise.all([
    supabase
      .from("destinations")
      .select(DESTINATION_COLUMNS)
      .eq("trip_id", tripId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .returns<Destination[]>(),
    supabase.from("transfers").select(TRANSFER_COLUMNS).eq("trip_id", tripId).returns<Transfer[]>(),
  ]);

  const loadError = dbErrorMessage(stopsError, legsError);
  const data = buildMapData(stops ?? [], legs ?? []);

  return (
    <>
      <Link href={`/trips/${tripId}`} className="inline-flex min-h-11 items-center text-sm underline">
        ← Zurück zur Reise
      </Link>
      <h1 className="text-2xl font-semibold">Karte · {trip.name}</h1>

      {loadError ? (
        <DbErrorNotice message={loadError} />
      ) : data.points.length === 0 ? (
        <Card>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Noch kein Reiseort hat einen Standort. Öffne einen Ort und suche bei «Standort auf der Karte»
            nach der Adresse.
          </p>
        </Card>
      ) : (
        <>
          <TripMap data={data} />
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-neutral-600 dark:text-neutral-400" aria-label="Legende">
            <li className="flex items-center gap-2">
              <span aria-hidden="true" className="inline-block h-1 w-8 rounded bg-red-700" /> Fahrt
            </li>
            <li className="flex items-center gap-2">
              <span aria-hidden="true" className="inline-block h-0.5 w-8 rounded bg-blue-700" /> Flug (Bogen)
            </li>
            <li className="flex items-center gap-2">
              <span aria-hidden="true" className="inline-block w-8 border-t-2 border-dashed border-neutral-600" /> Reihenfolge ohne Verschiebung
            </li>
          </ul>
        </>
      )}

      {data.unlocated.length > 0 && (
        <Card>
          <p className="text-sm">
            <span className="font-medium">Ohne Standort:</span> {data.unlocated.join(", ")}. Öffne den Ort und
            suche die Adresse, dann erscheint er auf der Karte.
          </p>
        </Card>
      )}
    </>
  );
}
