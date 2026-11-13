"use client";

import { Pencil, Sparkles, Trash2 } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { CATEGORIES, CATEGORY_LABELS, type BudgetLine, type Category, type Summary } from "@/lib/budget";
import {
  addEntry,
  applyEntries,
  deleteEntry,
  saveTotals,
  updateEntry,
  suggestEntries,
  type BudgetState,
  type BudgetSuggestions,
} from "./actions";

const nf = new Intl.NumberFormat("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n: number) => nf.format(n);

export function BudgetView({
  tripId,
  base,
  totalBudget,
  lines,
  summary,
  rates,
  failedRates,
}: {
  tripId: string;
  base: string;
  totalBudget: number | null;
  lines: BudgetLine[];
  summary: Summary;
  rates: Record<string, number>;
  failedRates: string[];
}) {
  const [suggest, setSuggest] = useState<BudgetSuggestions>(null);
  const [totals, saveTotal, savingTotal] = useActionState<BudgetState, FormData>(saveTotals.bind(null, tripId), null);
  const [added, add, adding] = useActionState<BudgetState, FormData>(addEntry.bind(null, tripId), null);
  const [applied, apply, applying] = useActionState<BudgetState, FormData>(async (prev, fd) => {
    const res = await applyEntries(tripId, prev, fd);
    if (!res) setSuggest(null);
    return res;
  }, null);
  const [searching, startSearch] = useTransition();
  const [, startRow] = useTransition();

  const rest = totalBudget !== null ? totalBudget - summary.expected : null;
  const rateNote = Object.entries(rates)
    .map(([cur, r]) => `1 ${cur} = ${r.toFixed(4)} ${base}`)
    .join(" · ");

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <h2 className="font-semibold">Übersicht in {base}</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat label="Voraussichtlich" value={`${money(summary.expected)}`} />
          <Stat label="Geplant" value={money(summary.planned)} />
          <Stat label="Bereits bezahlt" value={money(summary.actual)} />
          <Stat
            label={rest !== null && rest < 0 ? "Über Budget" : "Rest"}
            value={rest === null ? "kein Budget" : money(Math.abs(rest))}
            warn={rest !== null && rest < 0}
          />
        </dl>
        {summary.missing.length > 0 && (
          <p role="status" className="text-sm text-amber-800 dark:text-amber-300">
            Für {summary.missing.join(", ")} gibt es keinen Kurs. Diese Posten sind nicht in der Summe.
          </p>
        )}
        {failedRates.length > 0 && (
          <p className="text-xs text-neutral-500">Kurse für {failedRates.join(", ")} konnten nicht geladen werden.</p>
        )}
        {rateNote && <p className="text-xs text-neutral-500">Tageskurse (EZB): {rateNote}</p>}

        {summary.byCategory.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-neutral-500">
                <th className="py-1 font-normal">Kategorie</th>
                <th className="py-1 text-right font-normal">Geplant</th>
                <th className="py-1 text-right font-normal">Bezahlt</th>
              </tr>
            </thead>
            <tbody>
              {summary.byCategory.map((c) => (
                <tr key={c.category} className="border-t border-neutral-200 dark:border-neutral-800">
                  <td className="py-1.5">{CATEGORY_LABELS[c.category]}</td>
                  <td className="py-1.5 text-right tabular-nums">{money(c.planned)}</td>
                  <td className="py-1.5 text-right tabular-nums">{c.actual ? money(c.actual) : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <form action={saveTotal} className="flex flex-wrap items-end gap-3">
          <Field id="total_budget" label="Gesamtbudget">
            <Input id="total_budget" name="total_budget" inputMode="decimal" defaultValue={totalBudget ?? ""} placeholder="z. B. 8000" className="w-36" />
          </Field>
          <Field id="base_currency" label="Währung">
            <Input id="base_currency" name="base_currency" maxLength={3} defaultValue={base} className="w-24" />
          </Field>
          <Button type="submit" variant="outline" disabled={savingTotal}>Speichern</Button>
          {totals && <p role="alert" className="text-sm text-red-700">{totals.message}</p>}
        </form>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="font-semibold">Posten</h2>
        {lines.length === 0 ? (
          <p className="text-sm text-neutral-600 dark:text-neutral-400">Noch keine Posten. Preise aus Unterkünften, Verschiebungen und Fahrzeugen erscheinen hier automatisch.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {lines.map((l) => (
              <LineRow key={l.key} tripId={tripId} line={l} base={base} onRow={startRow} />
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <form action={add} className="flex flex-col gap-3">
          <h2 className="font-semibold">Posten hinzufügen</h2>
          <Field id="b-category" label="Kategorie">
            <Select id="b-category" name="category" defaultValue="food">
              {CATEGORIES.map((c: Category) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </Select>
          </Field>
          <Field id="b-description" label="Beschreibung">
            <Input id="b-description" name="description" required maxLength={150} placeholder="z. B. Lebensmittel Supermarkt" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="b-planned" label="Geplant">
              <Input id="b-planned" name="planned_amount" inputMode="decimal" />
            </Field>
            <Field id="b-actual" label="Bezahlt">
              <Input id="b-actual" name="actual_amount" inputMode="decimal" />
            </Field>
            <Field id="b-currency" label="Währung">
              <Input id="b-currency" name="currency" maxLength={3} defaultValue="CAD" />
            </Field>
            <Field id="b-date" label="Datum (optional)">
              <Input id="b-date" name="entry_date" type="date" />
            </Field>
            <Field id="b-rate" label={`Eigener Kurs in ${base} (optional)`}>
              <Input id="b-rate" name="rate_to_base" inputMode="decimal" placeholder="Tageskurs" />
            </Field>
          </div>
          {added && <p role="alert" className="text-sm text-red-700">{added.message}</p>}
          <div>
            <Button type="submit" disabled={adding}>Hinzufügen</Button>
          </div>
        </form>
      </Card>

      <Card className="flex flex-col gap-3">
        <div>
          <h2 className="font-semibold">Kosten von der KI schätzen</h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Die KI schlägt Posten vor, die noch fehlen (Treibstoff, Essen, Pässe, Versicherung …). Das sind grobe Richtwerte aus ihrem Wissen, keine belegten Preise. Du wählst aus.
          </p>
        </div>
        <div>
          <Button type="button" variant="outline" disabled={searching} onClick={() => startSearch(async () => setSuggest(await suggestEntries(tripId)))}>
            <Sparkles aria-hidden="true" className="mr-2 size-4" />
            {searching ? "Die KI schätzt …" : "Fehlende Posten schätzen"}
          </Button>
        </div>
        {suggest?.message && <p role="alert" className="text-sm text-red-700">{suggest.message}</p>}
        {suggest?.items && (
          <form action={apply} className="flex flex-col gap-3">
            <input type="hidden" name="items" value={JSON.stringify(suggest.items)} />
            <ul className="flex flex-col gap-2">
              {suggest.items.map((s, i) => (
                <li key={i} className="flex gap-3 rounded-lg border border-neutral-300 p-3 dark:border-neutral-700">
                  <input type="checkbox" name="pick" value={String(i)} defaultChecked aria-label="Übernehmen" className="mt-1 size-5 shrink-0 accent-red-700" />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium">{s.description}</p>
                    <p className="text-neutral-600 dark:text-neutral-400">
                      {CATEGORY_LABELS[s.category as Category] ?? s.category} · ca. {money(s.planned_amount)} {s.currency}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            {applied && <p role="alert" className="text-sm text-red-700">{applied.message}</p>}
            <div className="flex gap-3">
              <Button type="submit" disabled={applying}>Ausgewählte übernehmen</Button>
              <Button type="button" variant="ghost" onClick={() => setSuggest(null)}>Verwerfen</Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className={warn ? "text-base font-semibold text-red-700 dark:text-red-400" : "text-base font-semibold"}>{value}</dd>
    </div>
  );
}

function LineRow({
  tripId,
  line: l,
  base,
  onRow,
}: {
  tripId: string;
  line: BudgetLine;
  base: string;
  onRow: (fn: () => void) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [state, save, saving] = useActionState<BudgetState, FormData>(async (prev, fd) => {
    const res = await updateEntry(tripId, l.entryId!, prev, fd);
    if (!res) setEditing(false);
    return res;
  }, null);
  const iconBtn = "inline-flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800";

  if (editing && l.entryId) {
    return (
      <li className="rounded-lg border border-neutral-300 p-3 text-sm dark:border-neutral-700">
        <form action={save} className="flex flex-col gap-3">
          <Field id={`e-cat-${l.key}`} label="Kategorie">
            <Select id={`e-cat-${l.key}`} name="category" defaultValue={l.category}>
              {CATEGORIES.map((c: Category) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </Select>
          </Field>
          <Field id={`e-desc-${l.key}`} label="Beschreibung">
            <Input id={`e-desc-${l.key}`} name="description" required maxLength={150} defaultValue={l.description} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id={`e-pl-${l.key}`} label="Geplant">
              <Input id={`e-pl-${l.key}`} name="planned_amount" inputMode="decimal" defaultValue={l.planned ?? ""} />
            </Field>
            <Field id={`e-ac-${l.key}`} label="Bezahlt">
              <Input id={`e-ac-${l.key}`} name="actual_amount" inputMode="decimal" defaultValue={l.actual ?? ""} />
            </Field>
            <Field id={`e-cur-${l.key}`} label="Währung">
              <Input id={`e-cur-${l.key}`} name="currency" maxLength={3} defaultValue={l.currency} />
            </Field>
            <Field id={`e-dt-${l.key}`} label="Datum (optional)">
              <Input id={`e-dt-${l.key}`} name="entry_date" type="date" defaultValue={l.date ?? ""} />
            </Field>
            <Field id={`e-rt-${l.key}`} label={`Eigener Kurs in ${base}`}>
              <Input id={`e-rt-${l.key}`} name="rate_to_base" inputMode="decimal" defaultValue={l.rate ?? ""} placeholder="Tageskurs" />
            </Field>
          </div>
          {state && <p role="alert" className="text-sm text-red-700">{state.message}</p>}
          <div className="flex gap-3">
            <Button type="submit" disabled={saving}>Speichern</Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>Abbrechen</Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-start gap-1 rounded-lg border border-neutral-300 p-3 text-sm dark:border-neutral-700">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{l.description}</p>
        <p className="text-neutral-600 dark:text-neutral-400">
          {CATEGORY_LABELS[l.category]}
          {" · "}
          {l.planned !== null && `geplant ${money(l.planned)} ${l.currency}`}
          {l.actual !== null && `${l.planned !== null ? " · " : ""}bezahlt ${money(l.actual)} ${l.currency}`}
          {l.rate !== null && ` · Kurs ${l.rate}`}
          {l.origin === "auto" && (l.key.startsWith("a-") ? " · aus Aktivität" : " · aus Buchung")}
        </p>
      </div>
      {l.entryId ? (
        <>
          <button type="button" aria-label={`${l.description} bearbeiten`} onClick={() => setEditing(true)} className={iconBtn}>
            <Pencil aria-hidden="true" className="size-4" />
          </button>
          <button type="button" aria-label={`${l.description} löschen`} onClick={() => onRow(() => void deleteEntry(tripId, l.entryId!))} className={iconBtn}>
            <Trash2 aria-hidden="true" className="size-4" />
          </button>
        </>
      ) : null}
    </li>
  );
}
