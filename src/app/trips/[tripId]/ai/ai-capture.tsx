"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PlanPreview } from "@/components/plan-preview";
import { applyPlan, proposeEntries, type AiState } from "./actions";

const textarea =
  "min-h-40 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-red-700 dark:border-neutral-700";

export function AiCapture({ tripId, enabled, position }: { tripId: string; enabled: boolean; position: number | null }) {
  const [proposal, propose, proposing] = useActionState<AiState, FormData>(
    proposeEntries.bind(null, tripId),
    null,
  );
  const [applied, apply, applying] = useActionState<AiState, FormData>(
    applyPlan.bind(null, tripId),
    null,
  );
  const [dismissed, setDismissed] = useState<unknown>(null);
  const shown = applied?.plan ?? proposal?.plan;
  const plan = shown && shown !== dismissed ? shown : undefined;
  const message = applied?.message ?? proposal?.message;
  const text = proposal?.text ?? "";
  const [mode, setMode] = useState<"capture" | "search">("capture");
  const searching = mode === "search";

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <form action={propose} className="flex flex-col gap-3">
          {position !== null && <input type="hidden" name="pos" value={position} />}
          <fieldset className="flex flex-wrap gap-2">
            <legend className="sr-only">Modus</legend>
            {(
              [
                ["capture", "Eintragen", "Aus meinem Text erfassen"],
                ["search", "Vorschläge suchen", "Die KI recherchiert im Web"],
              ] as const
            ).map(([value, label, hint]) => (
              <label
                key={value}
                className="flex min-h-11 flex-1 cursor-pointer items-center gap-2 rounded-lg border border-neutral-300 px-3 has-[:checked]:border-red-700 has-[:checked]:bg-red-50 dark:border-neutral-700 dark:has-[:checked]:bg-red-950"
              >
                <input
                  type="radio"
                  name="mode"
                  value={value}
                  checked={mode === value}
                  onChange={() => setMode(value)}
                  className="size-4 accent-red-700"
                />
                <span className="text-sm">
                  <span className="font-medium">{label}</span>
                  <span className="block text-xs text-neutral-500">{hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <label htmlFor="ai-text" className="text-sm font-medium">
            {searching ? "Was soll die KI für dich suchen?" : "Was soll eingetragen werden?"}
          </label>
          <textarea
            id="ai-text"
            name="text"
            required
            minLength={10}
            maxLength={8000}
            defaultValue={text}
            className={textarea}
            placeholder={
              searching
                ? "z. B.: Schöne Campingplätze mit Seeblick zwischen Vancouver und Jasper, Ende Juli, für zwei Personen mit Mietwagen. " +
                  "Oder: Die besten Tageswanderungen im Banff-Nationalpark."
                : "Beschreibe es frei oder füge eine Buchungsbestätigung ein, z. B.:\n" +
              "Am 1. Juli um 10:30 fliegen wir von Zürich nach Vancouver, Flug AC 879. " +
              "Drei Nächte im Hotel am Hafen in Vancouver, dann mit dem Mietwagen nach Whistler (Campingplatz, 2 Nächte)."
            }
          />
          <p className="text-xs text-neutral-500">
            {searching
              ? "Die KI sucht im Web und macht Vorschläge mit Begründung und Quellen. Es ist nichts vorausgewählt: Hake an, was du übernehmen willst. Das dauert bis zu einer Minute."
              : "Die KI macht einen Vorschlag, den du prüfst. Gespeichert wird erst, wenn du ihn bestätigst. Nicht genannte Angaben bleiben leer; Dauer, Distanz und Ankunft werden wo möglich geschätzt."}
          </p>
          {!enabled && (
            <p role="status" className="text-sm text-amber-800 dark:text-amber-300">
              Die KI ist noch nicht eingerichtet:{" "}
              <Link href="/settings" className="underline">
                Claude-API-Schlüssel in den Einstellungen hinterlegen
              </Link>
              .
            </p>
          )}
          <div>
            <Button type="submit" disabled={proposing || applying}>
              <Sparkles aria-hidden="true" className="mr-2 size-4" />
              {proposing ? (searching ? "Die KI recherchiert …" : "Die KI liest …") : searching ? "Vorschläge suchen" : "Vorschlag erstellen"}
            </Button>
          </div>
        </form>
      </Card>

      {message && (
        <p role="alert" className="text-sm text-red-700">
          {message}
        </p>
      )}

      {plan && (
        <PlanPreview
          key={plan.mode + plan.summary}
          plan={plan}
          apply={apply}
          applying={applying}
          onDismiss={() => setDismissed(shown)}
          hidden={
            <>
              {position !== null && <input type="hidden" name="pos" value={position} />}
              <input type="hidden" name="text" value={text} />
            </>
          }
        />
      )}
    </div>
  );
}
