import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { loadSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { AiCapture } from "./ai-capture";

// Die KI und die Standortsuche brauchen bei längeren Texten einige Sekunden.
export const maxDuration = 300;

type Params = Promise<{ tripId: string }>;
type Search = Promise<{ pos?: string }>;

export default function AiPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
      <Suspense fallback={<p>Lädt …</p>}>
        <Content params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { tripId } = await params;
  const { pos } = await searchParams;
  if (!z.uuid().safeParse(tripId).success) notFound();

  const supabase = await createClient();
  const { data: trip } = await supabase.from("trips").select("id, name").eq("id", tripId).maybeSingle();
  if (!trip) notFound();

  const settings = await loadSettings(supabase);
  const { data: stops } = await supabase
    .from("destinations")
    .select("name")
    .eq("trip_id", tripId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  const names = (stops ?? []).map((d) => d.name as string);
  const position = pos !== undefined && /^\d{1,3}$/.test(pos) ? Math.min(Number(pos), names.length) : null;
  const where =
    position === null
      ? null
      : position === 0
        ? names.length
          ? `ganz am Anfang, vor «${names[0]}»`
          : "als erster Eintrag"
        : position >= names.length
          ? `am Ende, nach «${names[names.length - 1]}»`
          : `zwischen «${names[position - 1]}» und «${names[position]}»`;

  return (
    <>
      <Link href={`/trips/${tripId}`} className="inline-flex min-h-11 items-center text-sm underline">
        ← Zurück zur Reise
      </Link>
      <h1 className="text-2xl font-semibold">Mit KI erfassen · {trip.name}</h1>
      {where && (
        <p className="rounded-lg border border-neutral-300 p-3 text-sm dark:border-neutral-700">
          Neue Orte werden {where} eingefügt.{" "}
          <Link href={`/trips/${tripId}/ai`} className="underline">
            Stelle aufheben
          </Link>
        </p>
      )}
      <AiCapture tripId={tripId} enabled={Boolean(settings.anthropicKey)} position={position} />
    </>
  );
}
