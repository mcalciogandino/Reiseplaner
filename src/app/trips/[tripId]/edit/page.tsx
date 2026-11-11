import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { DeleteForm } from "@/components/delete-form";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { TRIP_COLUMNS, type Trip } from "@/lib/trips";
import { deleteTrip, updateTrip } from "../../actions";
import { TripForm } from "../../new/trip-form";

export default function EditTripPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-4">
      <Suspense fallback={<p>Lädt …</p>}>
        <EditTrip params={params} />
      </Suspense>
    </main>
  );
}

async function EditTrip({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  if (!z.uuid().safeParse(tripId).success) notFound();

  const supabase = await createClient();
  const { data: trip } = await supabase
    .from("trips")
    .select(TRIP_COLUMNS)
    .eq("id", tripId)
    .maybeSingle<Trip>();
  if (!trip) notFound();

  return (
    <>
      <Link href={`/trips/${tripId}`} className="inline-flex min-h-11 items-center text-sm underline">
        ← Zurück zur Reise
      </Link>
      <h1 className="text-2xl font-semibold">Reise bearbeiten</h1>
      <Card>
        <TripForm
          action={updateTrip.bind(null, tripId)}
          initial={trip}
          submitLabel="Speichern"
          cancelHref={`/trips/${tripId}`}
        />
      </Card>
      <Card className="flex flex-col gap-3">
        <h2 className="font-semibold">Reise löschen</h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Löscht die Reise mit allen Orten, Aktivitäten, Budgeteinträgen und
          Daten. Das lässt sich nicht rückgängig machen.
        </p>
        <DeleteForm
          action={deleteTrip.bind(null, tripId)}
          label="Reise endgültig löschen"
          confirmText={`«${trip.name}» mit allen Daten löschen?`}
        />
      </Card>
    </>
  );
}
