import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { loadSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { AiCapture } from "./ai-capture";

// Die KI und die Standortsuche brauchen bei längeren Texten einige Sekunden.
export const maxDuration = 120;

type Params = Promise<{ tripId: string }>;

export default function AiPage({ params }: { params: Params }) {
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

  const settings = await loadSettings(supabase);

  return (
    <>
      <Link href={`/trips/${tripId}`} className="inline-flex min-h-11 items-center text-sm underline">
        ← Zurück zur Reise
      </Link>
      <h1 className="text-2xl font-semibold">Mit KI erfassen · {trip.name}</h1>
      <AiCapture tripId={tripId} enabled={Boolean(settings.anthropicKey)} />
    </>
  );
}
