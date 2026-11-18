import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { loadFamily, variantLabel } from "@/lib/variants";
import { createVariant } from "../actions";
import { VariantForm } from "../variant-form";

export default function NewVariantPage({ params }: { params: Promise<{ tripId: string }> }) {
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
  if (!z.uuid().safeParse(tripId).success) notFound();
  const supabase = await createClient();
  const family = await loadFamily(supabase, tripId);
  const me = family.find((v) => v.id === tripId);
  if (!me) notFound();
  return (
    <>
      <Link href={`/trips/${tripId}`} className="inline-flex min-h-11 items-center text-sm underline">
        ← Zurück zur Reise
      </Link>
      <h1 className="text-2xl font-semibold">Neue Variante</h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Die Variante wird eine Kopie von «{variantLabel(me)}». Du wählst, was mitkommt; alles Weitere planst du frei.
      </p>
      <Card>
        <VariantForm action={createVariant.bind(null, tripId)} cancelHref={`/trips/${tripId}`} sourceLabel={variantLabel(me)} />
      </Card>
    </>
  );
}
