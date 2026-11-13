"use client";

import { CalendarPlus, Pencil, Sparkles, ThumbsUp, Trash2 } from "lucide-react";
import { useActionState, useState, useSyncExternalStore, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PRIORITIES, PRIORITY_LABELS, STATUSES, STATUS_LABELS, type Activity } from "@/lib/activities";
import {
  addActivity,
  addToDay,
  applyIdeas,
  deleteActivity,
  setStatus,
  suggestActivityIdeas,
  toggleVote,
  updateActivity,
  type ActState,
  type IdeaSuggestions,
} from "./actions";

type Item = Activity & { voters: string[]; votes: number };
type Place = { id: string; name: string };

const KEY = "reiseplaner-voter";
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};
function readName() {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}
function writeName(v: string) {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* Speicher nicht verfügbar */
  }
  listeners.forEach((l) => l());
}

const nf = new Intl.NumberFormat("de-CH", { maximumFractionDigits: 2 });
const fmt = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.`;

export function ActivitiesView({ tripId, items, places, days }: { tripId: string; items: Item[]; places: Place[]; days: string[] }) {
  const me = useSyncExternalStore(subscribe, readName, () => "");
  const [suggest, setSuggest] = useState<IdeaSuggestions>(null);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [added, add, adding] = useActionState<ActState, FormData>(addActivity.bind(null, tripId), null);
  const [applied, apply, applying] = useActionState<ActState, FormData>(async (prev, fd) => {
    const res = await applyIdeas(tripId, prev, fd);
    if (!res) setSuggest(null);
    return res;
  }, null);
  const [searching, startSearch] = useTransition();
  const [, startRow] = useTransition();

  const shown = items.filter((i) => filter === "all" || i.status === "idea" || i.status === "planned");
  const placeName = (id: string | null) => places.find((p) => p.id === id)?.name ?? null;

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-2">
        <Field id="voter" label="Mein Name (für Stimmen)">
          <Input id="voter" value={me} onChange={(e) => writeName(e.target.value)} maxLength={40} placeholder="z. B. Mario" className="max-w-xs" />
        </Field>
        <p className="text-xs text-neutral-500">Der Name wird nur in diesem Browser gespeichert. Mit «Dafür» gibst du deine Stimme ab. Wer zwei Namen nutzt, stimmt getrennt ab.</p>
      </Card>

      <div className="flex gap-2" role="group" aria-label="Filter">
        <Button type="button" variant={filter === "open" ? "default" : "outline"} onClick={() => setFilter("open")}>Offen</Button>
        <Button type="button" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>Alle</Button>
      </div>

      {shown.length === 0 ? (
        <Card><p className="text-sm text-neutral-600 dark:text-neutral-400">Noch keine Ideen. Füge unten eine hinzu oder lass die KI Vorschläge machen.</p></Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((a) => (
            <ActivityRow key={a.id} tripId={tripId} a={a} me={me} places={places} days={days} placeName={placeName(a.destination_id)} onRow={startRow} />
          ))}
        </ul>
      )}

      <Card>
        <form action={add} className="flex flex-col gap-3">
          <h2 className="font-semibold">Idee hinzufügen</h2>
          <input type="hidden" name="voter" value={me} />
          <ActivityFields prefix="n" places={places} />
          {added && <p role="alert" className="text-sm text-red-700">{added.message}</p>}
          <div><Button type="submit" disabled={adding}>Hinzufügen</Button></div>
        </form>
      </Card>

      <Card className="flex flex-col gap-3">
        <div>
          <h2 className="font-semibold">Ideen von der KI</h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">Die KI schlägt Aktivitäten zu euren Reiseorten vor. Kosten sind grobe Richtwerte. Du wählst aus.</p>
        </div>
        <div>
          <Button type="button" variant="outline" disabled={searching} onClick={() => startSearch(async () => setSuggest(await suggestActivityIdeas(tripId)))}>
            <Sparkles aria-hidden="true" className="mr-2 size-4" />
            {searching ? "Die KI sucht …" : "Ideen vorschlagen"}
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
                    <p className="font-medium">{s.title}</p>
                    {s.description && <p className="text-neutral-600 dark:text-neutral-400">{s.description}</p>}
                    <p className="text-xs text-neutral-500">
                      {[s.place, s.estimated_cost !== null ? `ca. ${nf.format(s.estimated_cost)} ${s.currency}` : null, s.needs_reservation ? "Reservation nötig" : null].filter(Boolean).join(" · ")}
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

function ActivityFields({ prefix, places, a }: { prefix: string; places: Place[]; a?: Item }) {
  const id = (n: string) => `${prefix}-${n}`;
  return (
    <>
      <Field id={id("title")} label="Titel">
        <Input id={id("title")} name="title" required maxLength={150} defaultValue={a?.title} placeholder="z. B. Whale Watching" />
      </Field>
      <Field id={id("description")} label="Beschreibung (optional)">
        <Input id={id("description")} name="description" maxLength={500} defaultValue={a?.description ?? ""} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id={id("place")} label="Ort">
          <Select id={id("place")} name="destination_id" defaultValue={a?.destination_id ?? ""}>
            <option value="">– kein Ort –</option>
            {places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field id={id("priority")} label="Wichtigkeit">
          <Select id={id("priority")} name="priority" defaultValue={a?.priority ?? "medium"}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
          </Select>
        </Field>
        <Field id={id("cost")} label="Geschätzte Kosten">
          <Input id={id("cost")} name="estimated_cost" inputMode="decimal" defaultValue={a?.estimated_cost ?? ""} />
        </Field>
        <Field id={id("cur")} label="Währung">
          <Input id={id("cur")} name="currency" maxLength={3} defaultValue={a?.currency ?? "CAD"} />
        </Field>
      </div>
      <Field id={id("url")} label="Link (optional)">
        <Input id={id("url")} name="url" type="url" maxLength={300} defaultValue={a?.url ?? ""} placeholder="https://…" />
      </Field>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" name="needs_reservation" defaultChecked={a?.needs_reservation} className="size-5 accent-red-700" /> Reservation nötig
      </label>
    </>
  );
}

function ActivityRow({
  tripId,
  a,
  me,
  places,
  days,
  placeName,
  onRow,
}: {
  tripId: string;
  a: Item;
  me: string;
  places: Place[];
  days: string[];
  placeName: string | null;
  onRow: (fn: () => void) => void;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "day">("view");
  const [state, save, saving] = useActionState<ActState, FormData>(async (prev, fd) => {
    const res = await updateActivity(tripId, a.id, prev, fd);
    if (!res) setMode("view");
    return res;
  }, null);
  const [dayState, saveDay, savingDay] = useActionState<ActState, FormData>(async (prev, fd) => {
    const res = await addToDay(tripId, a.id, prev, fd);
    if (!res) setMode("view");
    return res;
  }, null);
  const iconBtn = "inline-flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800";
  const voted = me.trim() !== "" && a.voters.includes(me.trim());

  if (mode === "edit") {
    return (
      <li>
        <Card>
          <form action={save} className="flex flex-col gap-3">
            <ActivityFields prefix={`e-${a.id}`} places={places} a={a} />
            {state && <p role="alert" className="text-sm text-red-700">{state.message}</p>}
            <div className="flex gap-3">
              <Button type="submit" disabled={saving}>Speichern</Button>
              <Button type="button" variant="ghost" onClick={() => setMode("view")}>Abbrechen</Button>
            </div>
          </form>
        </Card>
      </li>
    );
  }

  return (
    <li>
      <Card className="flex flex-col gap-2">
        <div className="flex items-start gap-1">
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium">{a.title}</p>
            {a.description && <p className="text-neutral-600 dark:text-neutral-400">{a.description}</p>}
            <p className="text-xs text-neutral-500">
              {[
                STATUS_LABELS[a.status],
                PRIORITY_LABELS[a.priority],
                placeName,
                a.estimated_cost !== null ? `ca. ${nf.format(a.estimated_cost)} ${a.currency}` : null,
                a.needs_reservation ? "Reservation nötig" : null,
              ].filter(Boolean).join(" · ")}
            </p>
            {a.url && (
              <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-xs underline">Link öffnen</a>
            )}
          </div>
          <button type="button" aria-label={`${a.title} bearbeiten`} onClick={() => setMode("edit")} className={iconBtn}>
            <Pencil aria-hidden="true" className="size-4" />
          </button>
          <button type="button" aria-label={`${a.title} löschen`} onClick={() => onRow(() => void deleteActivity(tripId, a.id))} className={iconBtn}>
            <Trash2 aria-hidden="true" className="size-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={voted ? "default" : "outline"}
            disabled={me.trim() === ""}
            aria-pressed={voted}
            title={me.trim() === "" ? "Trage zuerst oben deinen Namen ein." : undefined}
            onClick={() => onRow(() => void toggleVote(tripId, a.id, me))}
          >
            <ThumbsUp aria-hidden="true" className="mr-2 size-4" />
            Dafür · {a.votes}
          </Button>
          {a.voters.length > 0 && <span className="text-xs text-neutral-500">{a.voters.join(", ")}</span>}
          <label className="ml-auto flex items-center gap-2 text-sm">
            <span className="sr-only">Status</span>
            <Select value={a.status} onChange={(e) => onRow(() => void setStatus(tripId, a.id, e.target.value))} aria-label="Status">
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </Select>
          </label>
          <Button type="button" variant="outline" onClick={() => setMode(mode === "day" ? "view" : "day")}>
            <CalendarPlus aria-hidden="true" className="mr-2 size-4" />
            Zum Tag
          </Button>
        </div>

        {mode === "day" && (
          <form action={saveDay} className="flex flex-wrap items-end gap-3">
            <Field id={`d-${a.id}`} label="Tag im Tagesplan">
              <Select id={`d-${a.id}`} name="day" defaultValue={days[0]}>
                {days.map((d, i) => <option key={d} value={d}>Tag {i + 1} · {fmt(d)}</option>)}
              </Select>
            </Field>
            <Button type="submit" disabled={savingDay}>Übernehmen</Button>
            {dayState && <p role="alert" className="text-sm text-red-700">{dayState.message}</p>}
          </form>
        )}
      </Card>
    </li>
  );
}
