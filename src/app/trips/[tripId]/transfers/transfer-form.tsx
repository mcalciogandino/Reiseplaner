"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { LocationPicker } from "@/components/location-picker";
import { Select } from "@/components/ui/select";
import { EMPTY_ADDRESS } from "@/lib/geocode";
import { NEW_PLACE } from "@/lib/place-fields";
import { TIMEZONES } from "@/lib/destinations";
import { KIND_LABELS, KINDS } from "@/lib/transfers";
import { dateTimeBounds } from "@/lib/trips";
import type { TransferFormState } from "./actions";

export type StopOption = { id: string; name: string; timezone: string | null };


export function TransferForm({
  action,
  range,
  stops,
  initial = {},
  submitLabel,
  cancelHref,
}: {
  action: (prev: TransferFormState, formData: FormData) => Promise<TransferFormState>;
  range: { start_date: string; end_date: string };
  stops: StopOption[];
  initial?: Record<string, string>;
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState<TransferFormState, FormData>(action, null);
  const v = (k: string) => state?.values[k] ?? initial[k] ?? "";

  const [departTz, setDepartTz] = useState(v("depart_tz"));
  const [arriveTz, setArriveTz] = useState(v("arrive_tz"));
  const [departLocal, setDepartLocal] = useState(v("depart_local"));
  const departBounds = dateTimeBounds(range, v("depart_local"));
  const arriveBounds = dateTimeBounds(range, v("arrive_local"));
  const tzOf = (id: string) => stops.find((s) => s.id === id)?.timezone ?? "";
  const [fromSel, setFromSel] = useState(v("from_destination_id"));
  const [toSel, setToSel] = useState(v("to_destination_id"));

  const stopSelect = (
    name: string,
    label: string,
    value: string,
    setValue: (v: string) => void,
    onPick: (tz: string) => void,
  ) => (
    <Field id={name} label={label}>
      <Select
        id={name}
        name={name}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          const tz = tzOf(e.target.value);
          if (tz) onPick(tz);
        }}
      >
        <option value="">– keiner (freier Ort) –</option>
        {stops.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
        <option value={NEW_PLACE}>＋ Neuer Ort anlegen …</option>
      </Select>
    </Field>
  );

  /** Angaben zu einem Ort, der mit der Verschiebung zusammen angelegt wird. */
  const newPlace = (side: "from" | "to", onTimezone: (tz: string) => void) => {
    const p = `${side}_new_`;
    return (
      <div className="flex flex-col gap-4 rounded-lg bg-neutral-100 p-4 dark:bg-neutral-900">
        <p className="text-sm font-medium">Neuer Ort</p>
        <Field id={`${p}name`} label="Name">
          <Input id={`${p}name`} name={`${p}name`} required defaultValue={v(`${p}name`)} placeholder="z. B. Whistler" />
        </Field>
        <Field id={`${p}timezone`} label="Zeitzone" hint="Gilt auch für die Uhrzeit dieser Verschiebung.">
          <Select
            id={`${p}timezone`}
            name={`${p}timezone`}
            defaultValue={v(`${p}timezone`)}
            onChange={(e) => e.target.value && onTimezone(e.target.value)}
          >
            <option value="">– keine Angabe –</option>
            {TIMEZONES.map((z) => (
              <option key={z.value} value={z.value}>{z.label}</option>
            ))}
          </Select>
        </Field>
        <LocationPicker
          prefix={p}
          key={`${v(`${p}lat`)},${v(`${p}lng`)},${v(`${p}addr_street`)}`}
          defaultQuery={v(`${p}name`)}
          initial={{
            lat: v(`${p}lat`),
            lng: v(`${p}lng`),
            label: v(`${p}place_label`),
            address: {
              ...EMPTY_ADDRESS,
              street: v(`${p}addr_street`),
              house_number: v(`${p}addr_house_number`),
              postcode: v(`${p}addr_postcode`),
              city: v(`${p}addr_city`),
              region: v(`${p}addr_region`),
              country: v(`${p}addr_country`),
            },
          }}
        />
        <Field id={`${p}lodging_name`} label="Unterkunft (optional)" hint="Hotel, Campingplatz …">
          <Input id={`${p}lodging_name`} name={`${p}lodging_name`} defaultValue={v(`${p}lodging_name`)} />
        </Field>
        <p className="text-xs text-neutral-500">
          {side === "from" ? "Die Abreise" : "Die Ankunft"} dieses Ortes wird aus dem Datum der Verschiebung übernommen.
        </p>
      </div>
    );
  };

  const tzSelect = (name: string, value: string, set: (v: string) => void) => (
    <Field id={name} label="Zeitzone">
      <Select id={name} name={name} value={value} onChange={(e) => set(e.target.value)}>
        <option value="">– wählen –</option>
        {TIMEZONES.map((z) => (
          <option key={z.value} value={z.value}>{z.label}</option>
        ))}
      </Select>
    </Field>
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field id="kind" label="Art">
        <Select id="kind" name="kind" defaultValue={v("kind") || "flight"}>
          {KINDS.map((k) => (
            <option key={k} value={k}>{KIND_LABELS[k]}</option>
          ))}
        </Select>
      </Field>

      <fieldset className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <legend className="px-1 text-sm font-medium">Von</legend>
        {stopSelect("from_destination_id", "Reiseort", fromSel, setFromSel, setDepartTz)}
        {fromSel === NEW_PLACE ? (
          newPlace("from", setDepartTz)
        ) : (
          <Field id="from_place" label="oder freier Ort" hint="z. B. Flughafen Zürich">
            <Input id="from_place" name="from_place" defaultValue={v("from_place")} />
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="depart_local" label="Abfahrt (Ortszeit)">
            <Input
              id="depart_local"
              name="depart_local"
              type="datetime-local"
              min={departBounds.min}
              max={departBounds.max}
              defaultValue={v("depart_local")}
              onChange={(e) => setDepartLocal(e.target.value)}
            />
          </Field>
          {tzSelect("depart_tz", departTz, setDepartTz)}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <legend className="px-1 text-sm font-medium">Nach</legend>
        {stopSelect("to_destination_id", "Reiseort", toSel, setToSel, setArriveTz)}
        {toSel === NEW_PLACE ? (
          newPlace("to", setArriveTz)
        ) : (
          <Field id="to_place" label="oder freier Ort" hint="z. B. Flughafen Vancouver">
            <Input id="to_place" name="to_place" defaultValue={v("to_place")} />
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="arrive_local" label="Ankunft (Ortszeit)">
            <Input
              id="arrive_local"
              name="arrive_local"
              type="datetime-local"
              min={departLocal && departLocal <= arriveBounds.max ? departLocal : arriveBounds.min}
              max={arriveBounds.max}
              defaultValue={v("arrive_local")}
            />
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
