import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getTripRange } from "@/lib/trip-range";
import { createTransfer } from "../actions";
import { TransferForm, type StopOption } from "../transfer-form";

type Params = Promise<{ tripId: string }>;
type SearchParams = Promise<{ from?: string; to?: string }>;

export default function NewTransferPage({
  params,
  searchParams,
}: {
  params: Params;
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

async function Content({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { tripId } = await params;
  const query = await searchParams;
  if (!z.uuid().safeParse(tripId).success) notFound();

  const range = await getTripRange(tripId);
  const supabase = await createClient();
  const { data: stops } = await supabase
    .from("destinations")
    .select("id, name, timezone")
    .eq("trip_id", tripId)
    .order("sort_order", { ascending: true })
    .returns<StopOption[]>();

  // «+» in der Zeitleiste: Von/Nach mit den Nachbarorten vorbelegen (nur bekannte Orte).
  const known = new Map((stops ?? []).map((s) => [s.id, s]));
  const initial: Record<string, string> = {};
  if (query.from && known.has(query.from)) {
    initial.from_destination_id = query.from;
    initial.depart_tz = known.get(query.from)?.timezone ?? "";
  }
  if (query.to && known.has(query.to)) {
    initial.to_destination_id = query.to;
    initial.arrive_tz = known.get(query.to)?.timezone ?? "";
  }

  return (
    <>
      <Link href={`/trips/${tripId}`} className="inline-flex min-h-11 items-center text-sm underline">
        ← Zurück zur Reise
      </Link>
      <h1 className="text-2xl font-semibold">Neue Verschiebung</h1>
      <Card>
        <TransferForm
          action={createTransfer.bind(null, tripId)}
          range={range}
          stops={stops ?? []}
          initial={initial}
          submitLabel="Verschiebung hinzufügen"
          cancelHref={`/trips/${tripId}`}
        />
      </Card>
    </>
  );
}
