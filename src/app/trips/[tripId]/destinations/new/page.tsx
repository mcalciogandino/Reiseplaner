import Link from "next/link";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { createDestination } from "../actions";
import { DestinationForm } from "../destination-form";

export default function NewDestinationPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-4">
      <Suspense fallback={<p>Lädt …</p>}>
        <Content params={params} />
      </Suspense>
    </main>
  );
}

async function Content({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return (
    <>
      <Link href={`/trips/${tripId}`} className="inline-flex min-h-11 items-center text-sm underline">
        ← Zurück zur Reise
      </Link>
      <h1 className="text-2xl font-semibold">Neuer Reiseort</h1>
      <Card>
        <DestinationForm
          action={createDestination.bind(null, tripId)}
          submitLabel="Ort hinzufügen"
          cancelHref={`/trips/${tripId}`}
        />
      </Card>
    </>
  );
}
