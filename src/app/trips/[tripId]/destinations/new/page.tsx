import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getTripRange } from "@/lib/trip-range";
import { createDestination } from "../actions";
import { DestinationForm } from "../destination-form";

type SearchParams = Promise<{ pos?: string }>;

export default function NewDestinationPage({
  params,
  searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: SearchParams;
}) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-4">
      <Suspense fallback={<p>Lädt …</p>}>
        <Content params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({
  params,
  searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: SearchParams;
}) {
  const { tripId } = await params;
  const { pos } = await searchParams;
  // «+» in der Zeitleiste: Einfügestelle in der Routenreihenfolge, sonst ans Ende.
  const position = pos !== undefined && /^\d{1,3}$/.test(pos) ? Number(pos) : null;
  if (!z.uuid().safeParse(tripId).success) notFound();
  const range = await getTripRange(tripId);

  // Vorschlag: Ankunft = Abreise des letzten Ortes, sonst Reisestart.
  const supabase = await createClient();
  const { data: all } = await supabase
    .from("destinations")
    .select("departure_date")
    .eq("trip_id", tripId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .returns<{ departure_date: string | null }[]>();
  const list = all ?? [];
  const last = position === null ? list.at(-1) : list[position - 1];

  return (
    <>
      <Link href={`/trips/${tripId}`} className="inline-flex min-h-11 items-center text-sm underline">
        ← Zurück zur Reise
      </Link>
      <h1 className="text-2xl font-semibold">Neuer Reiseort</h1>
      <Card>
        <DestinationForm
          action={createDestination.bind(null, tripId, position)}
          range={range}
          initial={{ arrival_date: last?.departure_date ?? range.start_date }}
          submitLabel="Ort hinzufügen"
          cancelHref={`/trips/${tripId}`}
        />
      </Card>
    </>
  );
}
