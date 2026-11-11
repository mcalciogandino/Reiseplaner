import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { CHECKLIST_COLUMNS, sortItems, type ChecklistItem } from "@/lib/checklist";
import { createClient } from "@/lib/supabase/server";
import { ChecklistView } from "./checklist-view";

// Die Recherche mit Websuche dauert bis zu einer Minute.
export const maxDuration = 300;

type Params = Promise<{ tripId: string }>;

export default function ChecklistPage({ params }: { params: Params }) {
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
  const supabase = await createClient();
  const { data: trip } = await supabase.from("trips").select("id, name").eq("id", tripId).maybeSingle();
  if (!trip) notFound();
  const { data, error } = await supabase
    .from("checklist_items")
    .select(CHECKLIST_COLUMNS)
    .eq("trip_id", tripId)
    .returns<ChecklistItem[]>();
  const items = sortItems(data ?? []);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <Link href={`/trips/${tripId}`} className="inline-flex min-h-11 items-center text-sm underline">
        ← Zurück zur Reise
      </Link>
      <h1 className="text-2xl font-semibold">Checkliste · {trip.name}</h1>
      {error && (
        <p role="alert" className="rounded-lg border border-amber-600 p-3 text-sm text-amber-800 dark:text-amber-300">
          Die Checkliste konnte nicht geladen werden. Führe <code>supabase/catch-up.sql</code> im SQL Editor aus und lade die Seite neu.
        </p>
      )}
      <ChecklistView tripId={tripId} items={items} today={today} />
    </>
  );
}
