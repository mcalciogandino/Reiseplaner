import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { DeleteForm } from "@/components/delete-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { bookingProgress, placeStatus, transferStatus, vehicleStatus } from "@/lib/booking";
import { createClient } from "@/lib/supabase/server";
import { formatDate, tripDays } from "@/lib/trips";
import { loadFamily, variantLabel } from "@/lib/variants";
import { deleteVariant, promoteVariant, renameVariant } from "./actions";

export default function VariantsPage({ params }: { params: Promise<{ tripId: string }> }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
      <Suspense fallback={<p>Lädt …</p>}>
        <Content params={params} />
      </Suspense>
    </main>
  );
}

const linkButton =
  "inline-flex min-h-11 items-center rounded-lg border border-neutral-300 px-4 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800";

async function Content({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  if (!z.uuid().safeParse(tripId).success) notFound();
  const supabase = await createClient();
  const family = await loadFamily(supabase, tripId);
  if (!family.some((v) => v.id === tripId)) notFound();
  const ids = family.map((v) => v.id);

  const [trips, dests, legs, cars, budget] = await Promise.all([
    supabase.from("trips").select("id, start_date, end_date, base_currency").in("id", ids),
    supabase.from("destinations").select("trip_id, kind, booked, lodging_name, lodging_price, lodging_booking_ref").in("trip_id", ids),
    supabase.from("transfers").select("trip_id, booked, kind, booking_ref, is_option").in("trip_id", ids),
    supabase.from("vehicles").select("trip_id, booked").in("trip_id", ids),
    supabase.from("budget_summary").select("trip_id, planned_base").in("trip_id", ids),
  ]);
  const by = <T extends { trip_id: string }>(rows: T[] | null, id: string) => (rows ?? []).filter((r) => r.trip_id === id);

  const cards = family.map((v) => {
    const t = trips.data?.find((x) => x.id === v.id);
    const d = by(dests.data, v.id);
    const l = by(legs.data, v.id).filter((x) => !x.is_option);
    const c = by(cars.data, v.id);
    const cost = by(budget.data, v.id).reduce((s, r) => s + Number(r.planned_base ?? 0), 0);
    const progress = bookingProgress([
      ...d.map((x) => placeStatus({ kind: x.kind, booked: Boolean(x.booked), lodging_name: x.lodging_name, lodging_price: x.lodging_price, lodging_booking_ref: x.lodging_booking_ref })),
      ...l.map((x) => transferStatus({ booked: Boolean(x.booked), kind: x.kind, booking_ref: x.booking_ref })),
      ...c.map((x) => vehicleStatus({ booked: Boolean(x.booked) })),
    ]);
    return { v, t, places: d.length, transfers: l.length, cost, progress };
  });

  return (
    <>
      <Link href={`/trips/${tripId}`} className="inline-flex min-h-11 items-center text-sm underline">
        ← Zurück zur Reise
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Varianten vergleichen</h1>
        <Link href={`/trips/${tripId}/variants/new`} className={linkButton}>
          Neue Variante
        </Link>
      </div>
      <ul className="flex flex-col gap-3">
        {cards.map(({ v, t, places, transfers, cost, progress }) => (
          <li key={v.id}>
            <Card className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">
                  {variantLabel(v)}
                  {v.isRoot && v.variant_name && <span className="ml-2 text-xs font-normal text-neutral-500">(Hauptplan)</span>}
                </h2>
                <Link href={`/trips/${v.id}`} className={linkButton}>
                  Öffnen
                </Link>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <Stat label="Dauer" value={t ? `${tripDays(t.start_date, t.end_date)} Tage` : "–"} sub={t ? `${formatDate(t.start_date)} – ${formatDate(t.end_date)}` : undefined} />
                <Stat label="Orte" value={String(places)} sub={`${transfers} Verschiebungen`} />
                <Stat label="Kosten geplant" value={cost ? `${Math.round(cost).toLocaleString("de-CH")} ${t?.base_currency ?? ""}` : "–"} />
                <Stat label="Gebucht" value={progress.total ? `${progress.booked} von ${progress.total}` : "–"} />
              </dl>
              <details className="text-sm">
                <summary className="min-h-11 cursor-pointer py-2 underline">Verwalten</summary>
                <div className="flex flex-col gap-3 pb-1">
                  <form action={renameVariant.bind(null, v.id)} className="flex gap-2">
                    <Input name="name" required maxLength={60} defaultValue={variantLabel(v)} aria-label="Name der Variante" />
                    <Button type="submit" variant="outline">Umbenennen</Button>
                  </form>
                  {!v.isRoot && (
                    <div className="flex flex-wrap gap-3">
                      <DeleteForm action={promoteVariant.bind(null, v.id)} label="Zum Hauptplan machen" confirmText={`«${variantLabel(v)}» zum Hauptplan machen? Der bisherige Hauptplan wird eine Variante.`} tone="neutral" />
                      <DeleteForm action={deleteVariant.bind(null, v.id)} label="Variante löschen" confirmText={`Variante «${variantLabel(v)}» mit allen Daten löschen?`} />
                    </div>
                  )}
                </div>
              </details>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="text-neutral-500">{label}</dt>
      <dd className="font-semibold">{value}</dd>
      {sub && <dd className="text-xs text-neutral-500">{sub}</dd>}
    </div>
  );
}
