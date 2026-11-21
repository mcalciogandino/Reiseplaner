import { Trash2 } from "lucide-react";
import { VariantBar } from "../variants/variant-bar";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { formatLocal } from "@/lib/transfers";
import { formatDuration } from "@/lib/transfers";
import { VEHICLE_COLUMNS, VEHICLE_LABELS, vehicleUsage, type Vehicle } from "@/lib/vehicles";
import { BookedToggle, StatusBadge } from "@/components/booked-toggle";
import { STATUS_CARD, vehicleStatus } from "@/lib/booking";
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

  // Zugeordnete Autofahrten (ohne Alternativen) für Kilometer, Fahrten und Fahrzeit.
  const { data: drives } = await supabase
    .from("transfers")
    .select("vehicle_id, distance_km, route_distance_m, duration_min, route_duration_s")
    .eq("trip_id", tripId)
    .eq("kind", "drive")
    .eq("is_option", false);
  const usage = vehicleUsage((drives ?? []) as Parameters<typeof vehicleUsage>[0]);
  const unassigned = (drives ?? []).filter((d) => !d.vehicle_id).length;
  const nf = new Intl.NumberFormat("de-CH");

  const when = (iso: string | null, tz: string | null) => (iso ? formatLocal(iso, tz ?? "UTC") : "offen");

  return (
    <>
      <VariantBar tripId={tripId} suffix="/vehicles" />
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
      {unassigned > 0 && (data ?? []).length > 0 && (
        <p role="status" className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          {unassigned} {unassigned === 1 ? "Autofahrt ist" : "Autofahrten sind"} keinem Fahrzeug zugeordnet und {unassigned === 1 ? "zählt" : "zählen"} hier nicht mit. Wähle das Fahrzeug beim Bearbeiten der Fahrt.
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {(data ?? []).map((v) => (
          <li key={v.id}>
            <Card className={`flex items-start gap-3 ${STATUS_CARD[vehicleStatus(v)]}`}>
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
                {(() => {
                  const u = usage.get(v.id);
                  return (
                    <dl className="mt-2 grid grid-cols-3 gap-2 rounded-lg bg-neutral-100 p-3 dark:bg-neutral-800" aria-label="Fahrleistung">
                      <div>
                        <dt className="text-xs text-neutral-500">Kilometer</dt>
                        <dd className="font-semibold">{nf.format(u?.km ?? 0)} km</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-neutral-500">Fahrten</dt>
                        <dd className="font-semibold">{u?.trips ?? 0}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-neutral-500">Fahrzeit</dt>
                        <dd className="font-semibold">{u && u.minutes > 0 ? `ca. ${formatDuration(u.minutes)}` : "–"}</dd>
                      </div>
                      {u && u.withoutKm > 0 && (
                        <p className="col-span-3 text-xs text-neutral-600 dark:text-neutral-400">
                          {u.withoutKm} {u.withoutKm === 1 ? "Fahrt hat" : "Fahrten haben"} keine Distanz und {u.withoutKm === 1 ? "fehlt" : "fehlen"} in den Kilometern.
                        </p>
                      )}
                    </dl>
                  );
                })()}
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <StatusBadge status={vehicleStatus(v)} />
                  <BookedToggle tripId={tripId} table="vehicles" id={v.id} booked={v.booked} label={VEHICLE_LABELS[v.kind]} />
                </div>
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
