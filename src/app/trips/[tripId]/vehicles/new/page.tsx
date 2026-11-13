import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { createVehicle } from "../actions";
import { VehicleForm } from "../vehicle-form";

type Params = Promise<{ tripId: string }>;

export default function NewVehiclePage({ params }: { params: Params }) {
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
  return (
    <>
      <Link href={`/trips/${tripId}/vehicles`} className="inline-flex min-h-11 items-center text-sm underline">← Fahrzeuge</Link>
      <h1 className="text-2xl font-semibold">Neues Fahrzeug</h1>
      <VehicleForm action={createVehicle.bind(null, tripId)} initial={{}} submitLabel="Speichern" cancelHref={`/trips/${tripId}/vehicles`} />
    </>
  );
}
