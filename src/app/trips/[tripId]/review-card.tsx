"use client";

import { AlertTriangle, Info, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { checkTrip, type ReviewState } from "./review-actions";

export function ReviewCard({ tripId }: { tripId: string }) {
  const [state, setState] = useState<ReviewState>(null);
  const [pending, start] = useTransition();
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="font-semibold">Reise prüfen lassen</h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Die KI sucht nach Lücken, knappen Zeiten und langen Etappen. Es wird nichts geändert.
        </p>
      </div>
      <div>
        <Button type="button" variant="outline" disabled={pending} onClick={() => start(async () => setState(await checkTrip(tripId)))}>
          <Sparkles aria-hidden="true" className="mr-2 size-4" />
          {pending ? "Die KI prüft …" : "Plan prüfen"}
        </Button>
      </div>
      {state?.message && <p role="alert" className="text-sm text-red-700">{state.message}</p>}
      {state?.review && (
        <div role="status" className="flex flex-col gap-2 text-sm">
          {state.review.summary && <p>{state.review.summary}</p>}
          <ul className="flex flex-col gap-2">
            {state.review.findings.map((f, i) => (
              <li key={i} className="flex items-start gap-2">
                {f.level === "warn" ? (
                  <AlertTriangle aria-label="Warnung" className="mt-0.5 size-4 shrink-0 text-amber-700" />
                ) : (
                  <Info aria-label="Hinweis" className="mt-0.5 size-4 shrink-0 text-neutral-500" />
                )}
                <span>{f.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
