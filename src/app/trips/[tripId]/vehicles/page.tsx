import { Trash2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { formatLocal } from "@/lib/transfers";
import { VEHICLE_COLUMNS, VEHICLE_LABELS, type Vehicle } from "@/lib/vehicles";
import { deleteVehicle } from "./actions";

type Params = Promise<{ tripId: string }>;

export default function VehiclesPage({ params }: { params: Params }) {
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
  const { data: trip } = await supabase.from("trips").select("id, name").eq("id", tripId).maybeSingle();
  if (!trip) notFound();
  const { data, error } = await supabase
    .from("vehicles")
    .select(VEHICLE_COLUMNS)
    .eq("trip_id", tripId)
    .order("pickup_at", { ascending: true, nullsFirst: false })
    .returns<Vehicle[]>();

  const when = (iso: string | null, tz: string | null) => (iso ? formatLocal(iso, tz ?? "UTC") : "offen");

  return (
    <>
      <Link href={`/trips/${tripId}`} className="inline-flex min-h-11 items-center text-sm underline">
        ← Zurück zur Reise
      </Link>
      <h1 className="text-2xl font-semibold">Mietfahrzeuge · {trip.name}</h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Die KI plant Autofahrten nur für Zeiten, in denen ein Fahrzeug verfügbar ist. Du kannst Fahrzeuge von Hand erfassen oder über «Mit KI einfügen» im «+» der Zeitleiste: füge den Text der Buchung ein.
      </p>
      <div>
        <Link
          href={`/trips/${tripId}/vehicles/new`}
          className="inline-flex min-h-11 items-center rounded-lg bg-red-700 px-4 text-sm font-medium text-white hover:bg-red-800"
        >
          Fahrzeug hinzufügen
        </Link>
      </div>
      {error && (
        <p role="alert" className="rounded-lg border border-amber-600 p-3 text-sm text-amber-800 dark:text-amber-300">
          Die Fahrzeuge konnten nicht geladen werden. Führe <code>supabase/catch-up.sql</code> im SQL Editor aus.
        </p>
      )}
      {!error && (data ?? []).length === 0 && <p className="text-sm text-neutral-600 dark:text-neutral-400">Noch keine Fahrzeuge.</p>}
      <ul className="flex flex-col gap-3">
        {(data ?? []).map((v) => (
          <li key={v.id}>
            <Card className="flex items-start gap-3">
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold">
                  {VEHICLE_LABELS[v.kind]}
                  {(v.provider || v.vehicle_name) && ` · ${[v.provider, v.vehicle_name].filter(Boolean).join(" ")}`}
                </p>
                <p>
                  Übernahme {when(v.pickup_at, v.pickup_tz)}
                  {v.pickup_place && ` · ${v.pickup_place}`}
                </p>
                <p>
                  Rückgabe {when(v.return_at, v.return_tz)}
                  {v.return_place && ` · ${v.return_place}`}
                </p>
                <p className="text-neutral-600 dark:text-neutral-400">
                  {[v.price !== null ? `${v.price} ${v.currency ?? ""}`.trim() : null, v.booking_ref ? `Buchung ${v.booking_ref}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {v.notes && <p className="text-neutral-600 dark:text-neutral-400">{v.notes}</p>}
              </div>
              <Link
                href={`/trips/${tripId}/vehicles/${v.id}`}
                aria-label="Fahrzeug bearbeiten"
                className="inline-flex size-11 items-center justify-center rounded-lg text-sm underline hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                Ändern
              </Link>
              <form action={deleteVehicle.bind(null, tripId, v.id)}>
                <button
                  type="submit"
                  aria-label="Fahrzeug löschen"
                  className="inline-flex size-11 items-center justify-center rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </button>
              </form>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
