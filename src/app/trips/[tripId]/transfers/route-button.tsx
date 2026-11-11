"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { RouteState } from "./actions";

/** «Route neu berechnen»: holt die Strassenroute der Autofahrt und zeigt das Ergebnis an. */
export function RouteButton({
  action,
  hasRoute,
}: {
  action: () => Promise<RouteState>;
  hasRoute: boolean;
}) {
  const [state, formAction, pending] = useActionState<RouteState, FormData>(
    () => action(),
    null,
  );
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Berechne …" : hasRoute ? "Route neu berechnen" : "Route berechnen"}
        </Button>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Strassenroute für die Karte (OpenRouteService).
        </p>
      </div>
      <div aria-live="polite" className="text-sm">
        {state && <p className={state.ok ? "text-neutral-700 dark:text-neutral-300" : "text-red-700"}>{state.message}</p>}
      </div>
    </form>
  );
}
