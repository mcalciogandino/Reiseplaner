import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { DeleteForm } from "@/components/delete-form";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getTripRange } from "@/lib/trip-range";
import { KIND_LABELS, TRANSFER_COLUMNS, utcToLocalInput, type Transfer } from "@/lib/transfers";
import { deleteTransfer, recalculateRoute, updateTransfer } from "../actions";
import { RouteButton } from "../route-button";
import { TransferForm, type StopOption } from "../transfer-form";

type Params = Promise<{ tripId: string; transferId: string }>;

export default function EditTransferPage({ params }: { params: Params }) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-4">
      <Suspense fallback={<p>Lädt …</p>}>
        <Content params={params} />
      </Suspense>
    </main>
  );
}

async function Content({ params }: { params: Params }) {
  const { tripId, transferId } = await params;
  if (!z.uuid().safeParse(tripId).success || !z.uuid().safeParse(transferId).success) notFound();

  const range = await getTripRange(tripId);
  const supabase = await createClient();
  const { data: t } = await supabase
    .from("transfers")
    .select(TRANSFER_COLUMNS)
    .eq("id", transferId)
    .eq("trip_id", tripId)
    .maybeSingle<Transfer>();
  if (!t) notFound();

  const { data: stops } = await supabase
    .from("destinations")
    .select("id, name, timezone, lat, lng")
    .eq("trip_id", tripId)
    .order("sort_order", { ascending: true })
    .returns<StopOption[]>();

  const initial: Record<string, string> = {
    kind: t.kind,
    from_destination_id: t.from_destination_id ?? "",
    to_destination_id: t.to_destination_id ?? "",
    from_place: t.from_place ?? "",
    to_place: t.to_place ?? "",
    depart_tz: t.depart_tz ?? "",
    arrive_tz: t.arrive_tz ?? "",
    depart_local: t.depart_at && t.depart_tz ? utcToLocalInput(t.depart_at, t.depart_tz) : "",
    arrive_local: t.arrive_at && t.arrive_tz ? utcToLocalInput(t.arrive_at, t.arrive_tz) : "",
    duration_min: t.duration_min?.toString() ?? "",
    distance_km: t.distance_km?.toString() ?? "",
    carrier: t.carrier ?? "",
    flight_number: t.flight_number ?? "",
    booking_ref: t.booking_ref ?? "",
    from_lat: t.from_lat?.toString() ?? "",
    from_lng: t.from_lng?.toString() ?? "",
    to_lat: t.to_lat?.toString() ?? "",
    to_lng: t.to_lng?.toString() ?? "",
  };

  return (
    <>
      <Link href={`/trips/${tripId}`} className="inline-flex min-h-11 items-center text-sm underline">
        ← Zurück zur Reise
      </Link>
      <h1 className="text-2xl font-semibold">{KIND_LABELS[t.kind]} bearbeiten</h1>
      <Card>
        <TransferForm
          action={updateTransfer.bind(null, tripId, transferId)}
          range={range}
          stops={stops ?? []}
          initial={initial}
          submitLabel="Speichern"
          cancelHref={`/trips/${tripId}`}
        />
      </Card>
      {t.kind === "drive" && (
        <Card>
          <RouteButton
            action={recalculateRoute.bind(null, tripId, transferId)}
            hasRoute={t.route_distance_m !== null}
          />
        </Card>
      )}
      <DeleteForm
        action={deleteTransfer.bind(null, tripId, transferId)}
        label="Verschiebung löschen"
        confirmText="Diese Verschiebung löschen?"
      />
    </>
  );
}
