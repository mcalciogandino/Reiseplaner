"use client";

import { AlertTriangle, Sparkles, Trash2 } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { DayItem } from "@/lib/days";
import {
  addDayItem,
  applyDaySuggestions,
  deleteDayItem,
  suggestDay,
  type DayState,
  type DaySuggestions,
} from "./actions";

type Day = { date: string; number: number; places: string[]; moves: string[]; items: DayItem[]; warnings: string[] };

const fmt = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
const hm = (t: string | null) => (t ? t.slice(0, 5) : null);
const times = (a: string | null, b: string | null) => (a && b ? `${hm(a)}–${hm(b)}` : a ? `ab ${hm(a)}` : "");

export function DayCard({ tripId, day }: { tripId: string; day: Day }) {
  const [suggest, setSuggest] = useState<DaySuggestions>(null);
  const [added, add, adding] = useActionState<DayState, FormData>(addDayItem.bind(null, tripId, day.date), null);
  const [applied, apply, applying] = useActionState<DayState, FormData>(async (prev, fd) => {
    const res = await applyDaySuggestions(tripId, day.date, prev, fd);
    if (!res) setSuggest(null);
    return res;
  }, null);
  const [searching, startSearch] = useTransition();
  const [, startRow] = useTransition();

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="font-semibold">
          Tag {day.number} · {fmt(day.date)}
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">{day.places.join(", ") || "Kein Ort erfasst"}</p>
      </div>

      {day.moves.length > 0 && (
        <ul className="text-sm text-neutral-700 dark:text-neutral-300">
          {day.moves.map((m) => (
            <li key={m}>🚗 {m}</li>
          ))}
        </ul>
      )}
      {day.warnings.map((w) => (
        <p key={w} className="flex items-start gap-1 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {w}
        </p>
      ))}

      {day.items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {day.items.map((it) => (
            <li key={it.id} className="flex items-start gap-3 rounded-lg border border-neutral-300 p-3 dark:border-neutral-700">
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">
                  {times(it.start_time, it.end_time) && <span className="mr-2 font-normal text-neutral-500">{times(it.start_time, it.end_time)}</span>}
                  {it.title}
                  {it.plan_b && <span className="ml-2 rounded bg-neutral-200 px-1.5 py-0.5 text-xs font-normal dark:bg-neutral-700">Plan B</span>}
                </p>
                {it.description && <p className="text-neutral-600 dark:text-neutral-400">{it.description}</p>}
              </div>
              <button
                type="button"
                aria-label={`${it.title} löschen`}
                onClick={() => startRow(() => void deleteDayItem(tripId, it.id))}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form action={add} className="flex flex-col gap-2">
        <Input name="title" required maxLength={150} placeholder="Programmpunkt hinzufügen" aria-label="Programmpunkt" />
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Von
            <Input type="time" name="start_time" className="w-auto" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Bis
            <Input type="time" name="end_time" className="w-auto" />
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" name="plan_b" className="size-5 accent-red-700" /> Plan B
          </label>
          <Button type="submit" disabled={adding}>
            Hinzufügen
          </Button>
        </div>
        {added && <p role="alert" className="text-sm text-red-700">{added.message}</p>}
      </form>

      <div>
        <Button type="button" variant="outline" disabled={searching} onClick={() => startSearch(async () => setSuggest(await suggestDay(tripId, day.date)))}>
          <Sparkles aria-hidden="true" className="mr-2 size-4" />
          {searching ? "Die KI plant …" : "KI-Vorschlag für diesen Tag"}
        </Button>
      </div>
      {suggest?.message && <p role="alert" className="text-sm text-red-700">{suggest.message}</p>}
      {suggest?.items && (
        <form action={apply} className="flex flex-col gap-3">
          <input type="hidden" name="items" value={JSON.stringify(suggest.items)} />
          <ul className="flex flex-col gap-2">
            {suggest.items.map((s, i) => (
              <li key={i} className="flex gap-3 rounded-lg border border-neutral-300 p-3 dark:border-neutral-700">
                <input type="checkbox" name="pick" value={String(i)} defaultChecked={!s.plan_b} aria-label="Übernehmen" className="mt-1 size-5 shrink-0 accent-red-700" />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium">
                    {times(s.start_time, s.end_time) && <span className="mr-2 font-normal text-neutral-500">{times(s.start_time, s.end_time)}</span>}
                    {s.title}
                    {s.plan_b && <span className="ml-2 rounded bg-neutral-200 px-1.5 py-0.5 text-xs font-normal dark:bg-neutral-700">Plan B</span>}
                  </p>
                  {s.description && <p className="text-neutral-600 dark:text-neutral-400">{s.description}</p>}
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
  );
}
