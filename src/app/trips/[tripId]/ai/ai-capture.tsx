"use client";

import { AlertTriangle, Sparkles } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { PlanEndpoint } from "@/lib/ai/plan";
import { PLACE_KIND_LABELS, type PlaceKind } from "@/lib/destinations";
import { KIND_LABELS, formatDuration, type TransferKind } from "@/lib/transfers";
import { applyPlan, proposeEntries, type AiState } from "./actions";

const textarea =
  "min-h-40 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-red-700 dark:border-neutral-700";

const fmtDate = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
const fmtLocal = (l: string) => `${fmtDate(l.slice(0, 10))} ${l.slice(11, 16)}`;

export function AiCapture({ tripId, enabled }: { tripId: string; enabled: boolean }) {
  const [proposal, propose, proposing] = useActionState<AiState, FormData>(
    proposeEntries.bind(null, tripId),
    null,
  );
  const [applied, apply, applying] = useActionState<AiState, FormData>(
    applyPlan.bind(null, tripId),
    null,
  );
  const plan = applied?.plan ?? proposal?.plan;
  const message = applied?.message ?? proposal?.message;
  const text = proposal?.text ?? "";
  const [mode, setMode] = useState<"capture" | "search">("capture");
  const searching = mode === "search";

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <form action={propose} className="flex flex-col gap-3">
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
        <form key={plan.mode + plan.summary} action={apply} className="flex flex-col gap-4">
          <input type="hidden" name="plan" value={JSON.stringify(plan)} />
          <input type="hidden" name="text" value={text} />

          <Card className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-semibold">Vorschlag</h2>
              {plan.summary && <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{plan.summary}</p>}
            </div>

            {plan.questions.length > 0 && (
              <div role="status" className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                <p className="font-medium">Offene Fragen</p>
                <ul className="mt-1 list-disc pl-5">
                  {plan.questions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </div>
            )}

            {plan.places.length > 0 && (
              <section aria-labelledby="ai-places" className="flex flex-col gap-2">
                <h3 id="ai-places" className="text-sm font-semibold">Orte ({plan.places.length})</h3>
                <ul className="flex flex-col gap-2">
                  {plan.places.map((p) => (
                    <Row key={p.ref} name="place" value={p.ref} warnings={p.warnings} checked={plan.mode === "capture"}>
                      <p className="font-medium">
                        {p.name}{" "}
                        <span className="text-xs font-normal text-neutral-500">
                          {PLACE_KIND_LABELS[p.kind as PlaceKind] ?? p.kind}
                        </span>
                      </p>
                      <p className="text-sm text-neutral-600 dark:text-neutral-400">
                        {p.arrival_date || p.departure_date
                          ? `${p.arrival_date ? fmtDate(p.arrival_date) : "?"} – ${p.departure_date ? fmtDate(p.departure_date) : "?"}`
                          : "Datum offen"}
                        {p.lodging_name && ` · Unterkunft: ${p.lodging_name}`}
                      </p>
                      <p className="text-sm text-neutral-600 dark:text-neutral-400">
                        {p.lat !== null ? (p.place_label ?? "Standort gefunden") : "Kein Standort"}
                        {p.timezone && ` · ${p.timezone}`}
                      </p>
                      {p.reason && <p className="mt-1 text-sm">{p.reason}</p>}
                      {p.sources.length > 0 && (
                        <p className="mt-1 flex flex-wrap gap-x-3 text-sm">
                          {p.sources.map((u) => (
                            <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="underline">
                              {hostOf(u)}
                            </a>
                          ))}
                        </p>
                      )}
                    </Row>
                  ))}
                </ul>
              </section>
            )}

            {plan.transfers.length > 0 && (
              <section aria-labelledby="ai-transfers" className="flex flex-col gap-2">
                <h3 id="ai-transfers" className="text-sm font-semibold">Verschiebungen ({plan.transfers.length})</h3>
                <ul className="flex flex-col gap-2">
                  {plan.transfers.map((t, i) => (
                    <Row key={i} name="transfer" value={String(i)} warnings={t.warnings} checked={plan.mode === "capture"}>
                      <p className="font-medium">
                        {KIND_LABELS[t.kind as TransferKind] ?? t.kind}
                        <span className="font-normal"> · {endpointName(t.from)} → {endpointName(t.to)}</span>
                      </p>
                      <p className="text-sm text-neutral-600 dark:text-neutral-400">
                        {t.depart_local ? `Abfahrt ${fmtLocal(t.depart_local)}` : "Abfahrt offen"}
                        {t.arrive_local && ` · Ankunft ${fmtLocal(t.arrive_local)}`}
                        {t.estimated && " (geschätzt)"}
                      </p>
                      <p className="text-sm text-neutral-600 dark:text-neutral-400">
                        {[
                          t.carrier,
                          t.flight_number,
                          t.duration_min !== null ? formatDuration(t.duration_min) : null,
                          t.distance_km !== null ? `${t.distance_km} km` : null,
                          t.booking_ref ? `Buchung ${t.booking_ref}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </Row>
                  ))}
                </ul>
              </section>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={applying}>
                {applying ? "Speichere …" : "Ausgewählte übernehmen"}
              </Button>
              <Link href={`/trips/${tripId}/ai`} className="inline-flex min-h-11 items-center px-2 text-sm underline">
                Verwerfen
              </Link>
            </div>
          </Card>
        </form>
      )}
    </div>
  );
}

function hostOf(u: string) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
}

function endpointName(e: PlanEndpoint) {
  return e.label || "?";
}

function Row({
  name,
  value,
  warnings,
  checked,
  children,
}: {
  name: string;
  value: string;
  warnings: string[];
  checked: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3 rounded-lg border border-neutral-300 p-3 dark:border-neutral-700">
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={checked}
        aria-label="Übernehmen"
        className="mt-1 size-5 shrink-0 accent-red-700"
      />
      <div className="min-w-0 flex-1">
        {children}
        {warnings.map((w) => (
          <p key={w} className="mt-1 flex items-start gap-1 text-sm text-amber-800 dark:text-amber-300">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {w}
          </p>
        ))}
      </div>
    </li>
  );
}
