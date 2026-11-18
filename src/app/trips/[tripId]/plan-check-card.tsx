import { AlertTriangle, CircleAlert, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { checkPlan, type Finding } from "@/lib/plan-check";
import type { Destination } from "@/lib/destinations";
import type { Transfer } from "@/lib/transfers";
import { applyFix } from "./check-actions";

/** Regelbasierter Plan-Check (ohne KI): Doppelte, Überschneidungen, Lücken, widersprüchliche Daten. */
export function PlanCheckCard({
  tripId,
  trip,
  places,
  transfers,
}: {
  tripId: string;
  trip: { start_date: string; end_date: string };
  places: Destination[];
  transfers: Transfer[];
}) {
  if (places.length < 2) return null;
  const findings = checkPlan(trip, places, transfers);
  if (findings.length === 0) {
    return (
      <Card className="flex items-center gap-2 text-sm">
        <ShieldCheck aria-hidden="true" className="size-5 text-green-700" />
        Plan-Check: keine Doppelten, Überschneidungen oder Lücken gefunden.
      </Card>
    );
  }
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Plan-Check: {findings.length} {findings.length === 1 ? "Hinweis" : "Hinweise"}</h2>
      <ul className="flex flex-col gap-3">
        {findings.map((f) => (
          <FindingRow key={f.id} f={f} tripId={tripId} />
        ))}
      </ul>
    </Card>
  );
}

function FindingRow({ f, tripId }: { f: Finding; tripId: string }) {
  const Icon = f.severity === "error" ? CircleAlert : AlertTriangle;
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-neutral-300 p-3 text-sm dark:border-neutral-700">
      <p className="flex items-start gap-2 font-medium">
        <Icon aria-hidden="true" className={`mt-0.5 size-4 shrink-0 ${f.severity === "error" ? "text-red-700" : "text-amber-700"}`} />
        {f.title}
      </p>
      <p className="text-neutral-600 dark:text-neutral-400">{f.detail}</p>
      <div className="flex flex-wrap items-center gap-3">
        {f.fix && (
          <form action={applyFix.bind(null, tripId, JSON.stringify(f.fix.fix))}>
            <button type="submit" className="inline-flex min-h-11 items-center rounded-lg bg-red-700 px-4 font-medium text-white hover:bg-red-800">
              {f.fix.label}
            </button>
          </form>
        )}
        {f.ask && (
          <Link href={`/trips/${tripId}/chat?q=${encodeURIComponent(f.ask)}`} className="inline-flex min-h-11 items-center underline">
            Im Chat klären
          </Link>
        )}
      </div>
    </li>
  );
}
