"use client";

import { Sparkles, Trash2 } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { dueState, type ChecklistItem } from "@/lib/checklist";
import {
  addItem,
  applySuggestions,
  deleteItem,
  suggestItems,
  suggestPackingItems,
  toggleItem,
  type ChecklistState,
  type SuggestState,
} from "./actions";

const fmt = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};
const DUE_CLASS = {
  overdue: "text-red-700 dark:text-red-400",
  soon: "text-amber-800 dark:text-amber-300",
  later: "text-neutral-500",
} as const;

export function ChecklistView({ tripId, items, today }: { tripId: string; items: ChecklistItem[]; today: string }) {
  const [suggest, setSuggest] = useState<SuggestState>(null);
  const [added, add, adding] = useActionState<ChecklistState, FormData>(addItem.bind(null, tripId), null);
  const [applied, apply, applying] = useActionState<ChecklistState, FormData>(
    async (prev, fd) => {
      const res = await applySuggestions(tripId, prev, fd);
      if (!res) setSuggest(null);
      return res;
    },
    null,
  );
  const [searching, startSearch] = useTransition();
  const [, startRow] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <form action={add} className="flex flex-col gap-3">
          <label htmlFor="cl-title" className="text-sm font-medium">Neue Aufgabe</label>
          <Input id="cl-title" name="title" required maxLength={200} placeholder="z. B. eTA beantragen" />
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              Frist (optional)
              <Input type="date" name="due_date" className="w-auto" />
            </label>
            <input type="hidden" name="list" value="prep" />
            <Button type="submit" disabled={adding}>Hinzufügen</Button>
          </div>
          {added && <p role="alert" className="text-sm text-red-700">{added.message}</p>}
        </form>
      </Card>

      <Card className="flex flex-col gap-3">
        <div>
          <h2 className="font-semibold">KI-Hilfe</h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            «Fristen» recherchiert im Web, was wann beantragt oder reserviert werden muss (immer mit der Quelle prüfen). «Packliste» schlägt Dinge für Route und Jahreszeit vor.
          </p>
        </div>
        <div>
          <Button
            type="button"
            variant="outline"
            disabled={searching}
            onClick={() => startSearch(async () => setSuggest(await suggestItems(tripId)))}
          >
            <Sparkles aria-hidden="true" className="mr-2 size-4" />
            {searching ? "Die KI arbeitet … (bis zu 1 Min.)" : "Fristen recherchieren"}
          </Button>{" "}
          <Button
            type="button"
            variant="outline"
            disabled={searching}
            onClick={() => startSearch(async () => setSuggest(await suggestPackingItems(tripId)))}
          >
            <Sparkles aria-hidden="true" className="mr-2 size-4" />
            Packliste vorschlagen
          </Button>
        </div>
        {suggest?.message && <p role="alert" className="text-sm text-red-700">{suggest.message}</p>}
        {suggest?.items && (
          <form action={apply} className="flex flex-col gap-3">
            <input type="hidden" name="items" value={JSON.stringify(suggest.items)} />
            <input type="hidden" name="list" value={suggest.list ?? "prep"} />
            <ul className="flex flex-col gap-2">
              {suggest.items.map((s, i) => (
                <li key={i} className="flex gap-3 rounded-lg border border-neutral-300 p-3 dark:border-neutral-700">
                  <input type="checkbox" name="pick" value={String(i)} aria-label="Übernehmen" className="mt-1 size-5 shrink-0 accent-red-700" />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium">{s.title}</p>
                    <p className="text-neutral-600 dark:text-neutral-400">{s.due_date ? `Frist ${fmt(s.due_date)}` : "Keine Frist belegt"}</p>
                    {s.reason && <p className="mt-1">{s.reason}</p>}
                    {s.sources.length > 0 && (
                      <p className="mt-1 flex flex-wrap gap-x-3">
                        {s.sources.map((u) => (
                          <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="underline">{host(u)}</a>
                        ))}
                      </p>
                    )}
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

      {items.length === 0 ? (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">Noch keine Aufgaben.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((it) => {
            const state = dueState(it.due_date, it.done, today);
            return (
              <li key={it.id} className="flex items-start gap-3 rounded-lg border border-neutral-300 p-3 dark:border-neutral-700">
                <input
                  type="checkbox"
                  checked={it.done}
                  onChange={(e) => startRow(() => void toggleItem(tripId, it.id, e.target.checked))}
                  aria-label={`${it.title} erledigt`}
                  className="mt-1 size-5 shrink-0 accent-red-700"
                />
                <div className="min-w-0 flex-1 text-sm">
                  <p className={it.done ? "font-medium line-through opacity-60" : "font-medium"}>
                    {it.title}
                    {it.list === "packing" && <span className="ml-2 text-xs font-normal text-neutral-500">Packliste</span>}
                  </p>
                  {it.due_date && (
                    <p className={state ? DUE_CLASS[state] : "text-neutral-500"}>
                      Frist {fmt(it.due_date)}
                      {state === "overdue" && " · überfällig"}
                      {state === "soon" && " · bald fällig"}
                    </p>
                  )}
                  {it.notes && <p className="text-neutral-600 dark:text-neutral-400">{it.notes}</p>}
                  {it.source_ref && /^https?:\/\//i.test(it.source_ref) && (
                    <a href={it.source_ref} target="_blank" rel="noopener noreferrer" className="underline">
                      Quelle: {host(it.source_ref)}
                    </a>
                  )}
                </div>
                <button
                  type="button"
                  aria-label={`${it.title} löschen`}
                  onClick={() => startRow(() => void deleteItem(tripId, it.id))}
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
