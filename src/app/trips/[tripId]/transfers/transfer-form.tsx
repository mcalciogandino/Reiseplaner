"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { TIMEZONES } from "@/lib/destinations";
import { KIND_LABELS, KINDS } from "@/lib/transfers";
import type { TransferFormState } from "./actions";

export type StopOption = { id: string; name: string; timezone: string | null };

const selectClass =
  "min-h-11 w-full rounded-lg border border-neutral-300 bg-transparent px-3 text-base dark:border-neutral-700";

export function TransferForm({
  action,
  stops,
  initial = {},
  submitLabel,
  cancelHref,
}: {
  action: (prev: TransferFormState, formData: FormData) => Promise<TransferFormState>;
  stops: StopOption[];
  initial?: Record<string, string>;
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState<TransferFormState, FormData>(action, null);
  const v = (k: string) => state?.values[k] ?? initial[k] ?? "";

  const [departTz, setDepartTz] = useState(v("depart_tz"));
  const [arriveTz, setArriveTz] = useState(v("arrive_tz"));
  const tzOf = (id: string) => stops.find((s) => s.id === id)?.timezone ?? "";

  const stopSelect = (name: string, label: string, onPick: (tz: string) => void) => (
    <Field id={name} label={label}>
      <select
        id={name}
        name={name}
        defaultValue={v(name)}
        className={selectClass}
        onChange={(e) => {
          const tz = tzOf(e.target.value);
          if (tz) onPick(tz);
        }}
      >
        <option value="">– anderer Ort –</option>
        {stops.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
    </Field>
  );

  const tzSelect = (name: string, value: string, set: (v: string) => void) => (
    <Field id={name} label="Zeitzone">
      <select id={name} name={name} value={value} onChange={(e) => set(e.target.value)} className={selectClass}>
        <option value="">– wählen –</option>
        {TIMEZONES.map((z) => (
          <option key={z.value} value={z.value}>{z.label}</option>
        ))}
      </select>
    </Field>
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field id="kind" label="Art">
        <select id="kind" name="kind" defaultValue={v("kind") || "flight"} className={selectClass}>
          {KINDS.map((k) => (
            <option key={k} value={k}>{KIND_LABELS[k]}</option>
          ))}
        </select>
      </Field>

      <fieldset className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <legend className="px-1 text-sm font-medium">Von</legend>
        {stopSelect("from_destination_id", "Reiseort", setDepartTz)}
        <Field id="from_place" label="oder freier Ort" hint="z. B. Flughafen Zürich">
          <Input id="from_place" name="from_place" defaultValue={v("from_place")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="depart_local" label="Abfahrt (Ortszeit)">
            <Input id="depart_local" name="depart_local" type="datetime-local" defaultValue={v("depart_local")} />
          </Field>
          {tzSelect("depart_tz", departTz, setDepartTz)}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <legend className="px-1 text-sm font-medium">Nach</legend>
        {stopSelect("to_destination_id", "Reiseort", setArriveTz)}
        <Field id="to_place" label="oder freier Ort" hint="z. B. Flughafen Vancouver">
          <Input id="to_place" name="to_place" defaultValue={v("to_place")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="arrive_local" label="Ankunft (Ortszeit)">
            <Input id="arrive_local" name="arrive_local" type="datetime-local" defaultValue={v("arrive_local")} />
          </Field>
          {tzSelect("arrive_tz", arriveTz, setArriveTz)}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="duration_min" label="Dauer (Minuten)" hint="Nur nötig, wenn Abfahrt oder Ankunft fehlen.">
          <Input id="duration_min" name="duration_min" type="number" min={0} inputMode="numeric" defaultValue={v("duration_min")} />
        </Field>
        <Field id="distance_km" label="Distanz (km)">
          <Input id="distance_km" name="distance_km" type="number" min={0} inputMode="numeric" defaultValue={v("distance_km")} />
        </Field>
        <Field id="carrier" label="Anbieter" hint="Airline, Vermieter, Fährgesellschaft">
          <Input id="carrier" name="carrier" defaultValue={v("carrier")} />
        </Field>
        <Field id="flight_number" label="Flugnummer">
          <Input id="flight_number" name="flight_number" defaultValue={v("flight_number")} />
        </Field>
        <Field id="booking_ref" label="Buchungsnummer">
          <Input id="booking_ref" name="booking_ref" defaultValue={v("booking_ref")} />
        </Field>
      </div>

      {state?.message && <p role="alert" className="text-sm text-red-700">{state.message}</p>}
      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Speichere …" : submitLabel}</Button>
        <Link href={cancelHref} className="inline-flex min-h-11 items-center px-2 text-sm underline">Abbrechen</Link>
      </div>
    </form>
  );
}
