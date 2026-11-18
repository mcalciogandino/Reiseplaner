import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { DeleteForm } from "@/components/delete-form";
import { loadTripContext } from "@/lib/ai/trip-context";
import { loadSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/trips";
import { loadFamily, variantLabel } from "@/lib/variants";
import { VariantBar } from "../variants/variant-bar";
import { clearChat, type StoredProposal } from "./actions";
import { ChatView, type ChatMessage } from "./chat-view";

// Die KI (mit optionaler Websuche) und die Standortsuche brauchen einige Sekunden.
export const maxDuration = 300;

export default function ChatPage({ params }: { params: Promise<{ tripId: string }> }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
      <Suspense fallback={<p>Lädt …</p>}>
        <Content params={params} />
      </Suspense>
    </main>
  );
}

async function Content({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  if (!z.uuid().safeParse(tripId).success) notFound();
  const supabase = await createClient();
  const loaded = await loadTripContext(supabase, tripId);
  if (!loaded) notFound();

  const [settings, family, { data: rows }] = await Promise.all([
    loadSettings(supabase),
    loadFamily(supabase, tripId),
    supabase.from("chat_messages").select("id, role, content, proposal").eq("trip_id", tripId).order("created_at", { ascending: true }),
  ]);
  const messages: ChatMessage[] = (rows ?? []).map((r) => ({
    id: r.id as string,
    role: r.role as "user" | "assistant",
    content: r.content as string,
    proposal: (r.proposal as StoredProposal | null) ?? null,
  }));
  const me = family.find((v) => v.id === tripId);
  const { trip, counts } = loaded;

  return (
    <>
      <VariantBar tripId={tripId} suffix="/chat" />
      <Link href={`/trips/${tripId}`} className="inline-flex min-h-11 items-center text-sm underline">
        ← Zurück zur Reise
      </Link>
      <h1 className="text-2xl font-semibold">Mit KI planen</h1>
      <details className="rounded-xl border border-neutral-200 p-4 text-sm dark:border-neutral-800">
        <summary className="min-h-11 cursor-pointer py-2 font-medium">Das weiss die KI über «{me ? variantLabel(me) : trip.name}»</summary>
        <ul className="list-disc pl-5 text-neutral-600 dark:text-neutral-400">
          <li>
            {trip.name}, {formatDate(trip.start_date)} – {formatDate(trip.end_date)}
          </li>
          <li>
            {counts.places} Orte, {counts.transfers} Verschiebungen, {counts.vehicles} Fahrzeuge
          </li>
          <li>Eingefügt wird nur, was du im Vorschlag auswählst und bestätigst, und nur in diese Variante.</li>
          <li>Das Gespräch gehört zu dieser Variante; jede Variante hat ihren eigenen Verlauf.</li>
        </ul>
        {messages.length > 0 && (
          <div className="mt-3">
            <DeleteForm
              action={clearChat.bind(null, tripId)}
              label="Gespräch zurücksetzen"
              confirmText="Den Verlauf dieses Gesprächs löschen? Bereits eingefügte Einträge bleiben erhalten."
              tone="neutral"
            />
          </div>
        )}
      </details>
      <ChatView tripId={tripId} messages={messages} placeNames={loaded.places.map((p) => p.name)} enabled={Boolean(settings.anthropicKey)} />
    </>
  );
}
