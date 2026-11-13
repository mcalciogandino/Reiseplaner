"use client";

import { AlertTriangle, Sparkles } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { PlanEndpoint, PlanTransfer } from "@/lib/ai/plan";
import { PLACE_KIND_LABELS, type PlaceKind } from "@/lib/destinations";
import { KIND_LABELS, formatDuration, type TransferKind } from "@/lib/transfers";
import { VEHICLE_LABELS } from "@/lib/vehicles";
import { applyPlan, proposeEntries, type AiState } from "./actions";

const textarea =
  "min-h-40 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-red-700 dark:border-neutral-700";

const fmtDate = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
const fmtLocal = (l: string) => `${fmtDate(l.slice(0, 10))} ${l.slice(11, 16)}`;

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
  const { singles, groups } = splitTransfers(plan?.transfers ?? []);

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
        <form key={plan.mode + plan.summary} action={apply} className="flex flex-col gap-4">
          <input type="hidden" name="plan" value={JSON.stringify(plan)} />
          {position !== null && <input type="hidden" name="pos" value={position} />}
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
                        {p.lodging_price !== null && ` · ${p.lodging_price} ${p.lodging_currency ?? ""}`}
                        {p.lodging_checkin && ` · Check-in ab ${p.lodging_checkin}`}
                        {p.lodging_checkout && ` · Check-out bis ${p.lodging_checkout}`}
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
              <section aria-labelledby="ai-transfers" className="flex flex-col gap-3">
                <h3 id="ai-transfers" className="text-sm font-semibold">Verschiebungen</h3>
                <ul className="flex flex-col gap-2">
                  {singles.map(({ t, i }) => (
                    <Row key={i} name="transfer" value={String(i)} warnings={t.warnings} checked={plan.mode === "capture"}>
                      <TransferBody t={t} />
                    </Row>
                  ))}
                </ul>
                {groups.map(([key, members]) => (
                  <fieldset key={key} className="flex flex-col gap-2 rounded-lg border border-neutral-300 p-3 dark:border-neutral-700">
                    <legend className="px-1 text-sm font-medium">
                      Wie kommt ihr von {endpointName(members[0].t.from)} nach {endpointName(members[0].t.to)}? Wähle eine Möglichkeit
                    </legend>
                    <ul className="flex flex-col gap-2">
                      {members.map(({ t, i }, n) => (
                        <Row key={i} name={`grp_${key}`} value={String(i)} type="radio" warnings={t.warnings} checked={plan.mode === "capture" && n === 0}>
                          <TransferBody t={t} />
                        </Row>
                      ))}
                      <Row name={`grp_${key}`} value="" type="radio" warnings={[]} checked={false}>
                        <p className="text-sm">Keine davon übernehmen</p>
                      </Row>
                    </ul>
                  </fieldset>
                ))}
                {groups.length > 0 && (
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <input type="checkbox" name="keep_options" value="1" defaultChecked className="size-5 accent-red-700" />
                    Die anderen Möglichkeiten als Alternativen speichern
                  </label>
                )}
              </section>
            )}

            {plan.vehicles.length > 0 && (
              <section aria-labelledby="ai-vehicles" className="flex flex-col gap-2">
                <h3 id="ai-vehicles" className="text-sm font-semibold">Mietfahrzeuge ({plan.vehicles.length})</h3>
                <ul className="flex flex-col gap-2">
                  {plan.vehicles.map((v, i) => (
                    <Row key={i} name="vehicle" value={String(i)} warnings={v.warnings} checked={plan.mode === "capture"}>
                      <p className="font-medium">
                        {VEHICLE_LABELS[v.kind]}
                        <span className="font-normal">{[v.provider, v.vehicle_name].filter(Boolean).length ? ` · ${[v.provider, v.vehicle_name].filter(Boolean).join(" ")}` : ""}</span>
                      </p>
                      <p className="text-sm text-neutral-600 dark:text-neutral-400">
                        {v.pickup_local ? `Übernahme ${fmtLocal(v.pickup_local)}` : "Übernahme offen"}
                        {v.pickup_place && ` in ${v.pickup_place}`}
                      </p>
                      <p className="text-sm text-neutral-600 dark:text-neutral-400">
                        {v.return_local ? `Rückgabe ${fmtLocal(v.return_local)}` : "Rückgabe offen"}
                        {v.return_place && ` in ${v.return_place}`}
                        {v.price !== null && ` · ${v.price} ${v.currency ?? ""}`}
                        {v.booking_ref && ` · Buchung ${v.booking_ref}`}
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
              <Button type="button" variant="ghost" onClick={() => setDismissed(shown)}>
                Verwerfen
              </Button>
            </div>
          </Card>
        </form>
      )}
    </div>
  );
}

/** Verbindungen mit mindestens zwei Varianten in derselben Gruppe werden zur Auswahl; alle anderen sind einzeln. */
function splitTransfers(transfers: PlanTransfer[]) {
  const byGroup = new Map<string, { t: PlanTransfer; i: number }[]>();
  transfers.forEach((t, i) => {
    if (t.group) byGroup.set(t.group, [...(byGroup.get(t.group) ?? []), { t, i }]);
  });
  const grouped = new Set<number>();
  const groups: [string, { t: PlanTransfer; i: number }[]][] = [];
  let n = 0;
  for (const members of byGroup.values()) {
    if (members.length < 2) continue;
    members.forEach((m) => grouped.add(m.i));
    groups.push([String(n++), members]);
  }
  const singles = transfers.flatMap((t, i) => (grouped.has(i) ? [] : [{ t, i }]));
  return { singles, groups };
}

function TransferBody({ t }: { t: PlanTransfer }) {
  return (
    <>
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
          t.price !== null ? `ca. ${t.price} ${t.currency ?? ""}`.trim() : null,
          t.booking_ref ? `Buchung ${t.booking_ref}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {t.notes && <p className="text-sm text-neutral-600 dark:text-neutral-400">{t.notes}</p>}
    </>
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
  type = "checkbox",
  children,
}: {
  name: string;
  value: string;
  warnings: string[];
  checked: boolean;
  type?: "checkbox" | "radio";
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3 rounded-lg border border-neutral-300 p-3 dark:border-neutral-700">
      <input
        type={type}
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
