import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { createTransfer } from "../actions";
import { TransferForm, type StopOption } from "../transfer-form";

type Params = Promise<{ tripId: string }>;

export default function NewTransferPage({ params }: { params: Params }) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-4">
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
  const { data: stops } = await supabase
    .from("destinations")
    .select("id, name, timezone")
    .eq("trip_id", tripId)
    .order("sort_order", { ascending: true })
    .returns<StopOption[]>();

  return (
    <>
      <Link href={`/trips/${tripId}`} className="inline-flex min-h-11 items-center text-sm underline">
        ← Zurück zur Reise
      </Link>
      <h1 className="text-2xl font-semibold">Neue Verschiebung</h1>
      <Card>
        <TransferForm
          action={createTransfer.bind(null, tripId)}
          stops={stops ?? []}
          submitLabel="Verschiebung hinzufügen"
          cancelHref={`/trips/${tripId}`}
        />
      </Card>
    </>
  );
}
