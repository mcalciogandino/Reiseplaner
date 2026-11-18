import { GitBranch, Plus } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadFamily, variantLabel } from "@/lib/variants";

/** Reiter zum Wechseln zwischen Hauptplan und Varianten. Erscheint auch ohne Varianten, damit man sie anlegen kann. */
export async function VariantBar({ tripId }: { tripId: string }) {
  const supabase = await createClient();
  const family = await loadFamily(supabase, tripId);
  if (!family.length) return null;
  return (
    <nav aria-label="Varianten" className="flex flex-wrap items-center gap-2 border-b border-neutral-200 pb-3 dark:border-neutral-800">
      <GitBranch aria-hidden="true" className="size-4 text-neutral-500" />
      {family.map((v) => {
        const current = v.id === tripId;
        return (
          <Link
            key={v.id}
            href={`/trips/${v.id}`}
            aria-current={current ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium ${
              current
                ? "border-red-700 bg-red-700 text-white"
                : "border-neutral-300 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            }`}
          >
            {variantLabel(v)}
          </Link>
        );
      })}
      <Link
        href={`/trips/${tripId}/variants/new`}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-dashed border-neutral-400 px-4 text-sm font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800"
      >
        <Plus aria-hidden="true" className="size-4" /> Neue Variante
      </Link>
      {family.length > 1 && (
        <Link href={`/trips/${tripId}/variants`} className="inline-flex min-h-11 items-center px-2 text-sm underline">
          Vergleichen
        </Link>
      )}
    </nav>
  );
}
