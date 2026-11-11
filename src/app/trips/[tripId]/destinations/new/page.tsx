import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getTripRange } from "@/lib/trip-range";
import { createDestination } from "../actions";
import { DestinationForm } from "../destination-form";

export default function NewDestinationPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-4">
      <Suspense fallback={<p>Lädt …</p>}>
        <Content params={params} />
      </Suspense>
    </main>
  );
}

async function Content({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  if (!z.uuid().safeParse(tripId).success) notFound();
  const range = await getTripRange(tripId);

  // Vorschlag: Ankunft = Abreise des letzten Ortes, sonst Reisestart.
  const supabase = await createClient();
  const { data: last } = await supabase
    .from("destinations")
    .select("departure_date")
    .eq("trip_id", tripId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle<{ departure_date: string | null }>();

  return (
    <>
      <Link href={`/trips/${tripId}`} className="inline-flex min-h-11 items-center text-sm underline">
        ← Zurück zur Reise
      </Link>
      <h1 className="text-2xl font-semibold">Neuer Reiseort</h1>
      <Card>
        <DestinationForm
          action={createDestination.bind(null, tripId)}
          range={range}
          initial={{ arrival_date: last?.departure_date ?? range.start_date }}
          submitLabel="Ort hinzufügen"
          cancelHref={`/trips/${tripId}`}
        />
      </Card>
    </>
  );
}
