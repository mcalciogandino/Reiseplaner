"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { LocationPicker } from "@/components/location-picker";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TIMEZONES } from "@/lib/destinations";
import { dateBounds } from "@/lib/trips";
import type { DestinationFormState } from "./actions";

type Initial = Partial<Record<string, string | number | null>>;

const textarea =
  "min-h-24 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-red-700 dark:border-neutral-700";

export function DestinationForm({
  action,
  range,
  initial = {},
  submitLabel,
  cancelHref,
}: {
  action: (prev: DestinationFormState, formData: FormData) => Promise<DestinationFormState>;
  range: { start_date: string; end_date: string };
  initial?: Initial;
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState<DestinationFormState, FormData>(action, null);
  const v = (k: string) => state?.values[k] ?? String(initial[k] ?? "");
  const [arrival, setArrival] = useState(v("arrival_date"));
  const arrivalBounds = dateBounds(range, arrival);
  const departureBounds = dateBounds(range, v("departure_date"));

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field id="name" label="Ort">
        <Input id="name" name="name" required defaultValue={v("name")} placeholder="z. B. Whistler" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="arrival_date" label="Ankunft">
          <Input
            id="arrival_date"
            name="arrival_date"
            type="date"
            min={arrivalBounds.min}
            max={arrivalBounds.max}
            defaultValue={v("arrival_date")}
            onChange={(e) => setArrival(e.target.value)}
          />
        </Field>
        <Field id="departure_date" label="Abreise">
          <Input
            id="departure_date"
            name="departure_date"
            type="date"
            min={arrival && arrival <= departureBounds.max ? arrival : departureBounds.min}
            max={departureBounds.max}
            defaultValue={v("departure_date")}
          />
        </Field>
      </div>
      <Field id="timezone" label="Zeitzone" hint="Uhrzeiten im Tagesplan gelten in der Ortszeit.">
        <Select id="timezone" name="timezone" defaultValue={v("timezone")}>
          <option value="">– keine Angabe –</option>
          {TIMEZONES.map((z) => (
            <option key={z.value} value={z.value}>{z.label}</option>
          ))}
        </Select>
      </Field>
      <LocationPicker
        key={`${v("lat")},${v("lng")}`}
        initial={{ lat: v("lat"), lng: v("lng"), label: v("place_label") }}
        defaultQuery={v("name")}
      />
      <Field id="description" label="Beschreibung">
        <textarea id="description" name="description" defaultValue={v("description")} className={textarea} />
      </Field>

      <fieldset className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <legend className="px-1 text-sm font-medium">Unterkunft</legend>
        <Field id="lodging_name" label="Name">
          <Input id="lodging_name" name="lodging_name" defaultValue={v("lodging_name")} />
        </Field>
        <Field id="lodging_address" label="Adresse">
          <Input id="lodging_address" name="lodging_address" defaultValue={v("lodging_address")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="lodging_checkin" label="Check-in ab">
            <Input id="lodging_checkin" name="lodging_checkin" type="time" defaultValue={v("lodging_checkin").slice(0, 5)} />
          </Field>
          <Field id="lodging_booking_ref" label="Buchungsnummer">
            <Input id="lodging_booking_ref" name="lodging_booking_ref" defaultValue={v("lodging_booking_ref")} />
          </Field>
        </div>
      </fieldset>

      <Field id="notes" label="Notizen">
        <textarea id="notes" name="notes" defaultValue={v("notes")} className={textarea} />
      </Field>

      {state?.message && (
        <p role="alert" className="text-sm text-red-700">{state.message}</p>
      )}
      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Speichere …" : submitLabel}</Button>
        <Link href={cancelHref} className="inline-flex min-h-11 items-center px-2 text-sm underline">Abbrechen</Link>
      </div>
    </form>
  );
}
