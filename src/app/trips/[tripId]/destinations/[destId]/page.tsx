import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { DeleteForm } from "@/components/delete-form";
import { Card } from "@/components/ui/card";
import { DESTINATION_COLUMNS, type Destination } from "@/lib/destinations";
import { createClient } from "@/lib/supabase/server";
import { getTripRange } from "@/lib/trip-range";
import { deleteDestination, updateDestination } from "../actions";
import { DestinationForm } from "../destination-form";

type Params = Promise<{ tripId: string; destId: string }>;

export default function EditDestinationPage({ params }: { params: Params }) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-4">
      <Suspense fallback={<p>Lädt …</p>}>
        <Content params={params} />
      </Suspense>
    </main>
  );
}

async function Content({ params }: { params: Params }) {
  const { tripId, destId } = await params;
  if (!z.uuid().safeParse(tripId).success || !z.uuid().safeParse(destId).success) notFound();

  const range = await getTripRange(tripId);
  const supabase = await createClient();
  const { data: dest } = await supabase
    .from("destinations")
    .select(DESTINATION_COLUMNS)
    .eq("id", destId)
    .eq("trip_id", tripId)
    .maybeSingle<Destination>();
  if (!dest) notFound();

  return (
    <>
      <Link href={`/trips/${tripId}`} className="inline-flex min-h-11 items-center text-sm underline">
        ← Zurück zur Reise
      </Link>
      <h1 className="text-2xl font-semibold">{dest.name}</h1>
      <Card>
        <DestinationForm
          action={updateDestination.bind(null, tripId, destId)}
          range={range}
          initial={dest}
          submitLabel="Speichern"
          cancelHref={`/trips/${tripId}`}
        />
      </Card>
      <DeleteForm
        action={deleteDestination.bind(null, tripId, destId)}
        label="Ort löschen"
        confirmText={`«${dest.name}» löschen?`}
      />
    </>
  );
}
