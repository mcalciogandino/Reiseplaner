import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { utcToLocalInput } from "@/lib/transfers";
import { VEHICLE_COLUMNS, type Vehicle } from "@/lib/vehicles";
import { updateVehicle } from "../actions";
import { VehicleForm } from "../vehicle-form";

type Params = Promise<{ tripId: string; vehicleId: string }>;

export default function EditVehiclePage({ params }: { params: Params }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
      <Suspense fallback={<p>Lädt …</p>}>
        <Content params={params} />
      </Suspense>
    </main>
  );
}

async function Content({ params }: { params: Params }) {
  const { tripId, vehicleId } = await params;
  if (!z.uuid().safeParse(tripId).success || !z.uuid().safeParse(vehicleId).success) notFound();
  const supabase = await createClient();
  const { data: v } = await supabase
    .from("vehicles")
    .select(VEHICLE_COLUMNS)
    .eq("id", vehicleId)
    .eq("trip_id", tripId)
    .maybeSingle<Vehicle>();
  if (!v) notFound();

  const initial: Record<string, string> = {
    kind: v.kind,
    provider: v.provider ?? "",
    vehicle_name: v.vehicle_name ?? "",
    pickup_place: v.pickup_place ?? "",
    pickup_local: v.pickup_at && v.pickup_tz ? utcToLocalInput(v.pickup_at, v.pickup_tz) : "",
    pickup_tz: v.pickup_tz ?? "",
    return_place: v.return_place ?? "",
    return_local: v.return_at && v.return_tz ? utcToLocalInput(v.return_at, v.return_tz) : "",
    return_tz: v.return_tz ?? "",
    booking_ref: v.booking_ref ?? "",
    price: v.price === null ? "" : String(v.price),
    currency: v.currency ?? "",
    notes: v.notes ?? "",
  };
  return (
    <>
      <Link href={`/trips/${tripId}/vehicles`} className="inline-flex min-h-11 items-center text-sm underline">← Fahrzeuge</Link>
      <h1 className="text-2xl font-semibold">Fahrzeug bearbeiten</h1>
      <VehicleForm action={updateVehicle.bind(null, tripId, vehicleId)} initial={initial} submitLabel="Speichern" cancelHref={`/trips/${tripId}/vehicles`} />
    </>
  );
}
