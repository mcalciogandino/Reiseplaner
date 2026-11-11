"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { LocationPicker } from "@/components/location-picker";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TimeField } from "@/components/ui/date-time-field";
import { PLACE_KIND_LABELS, PLACE_KINDS } from "@/lib/destinations";
import { zoneOptions } from "@/lib/timezone";
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
  const [timezone, setTimezone] = useState(v("timezone"));
  const [derived, setDerived] = useState(false);
  const arrivalBounds = dateBounds(range, arrival);
  const departureBounds = dateBounds(range, v("departure_date"));

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field id="name" label="Ort">
        <Input id="name" name="name" required defaultValue={v("name")} placeholder="z. B. Whistler" />
      </Field>
      <Field id="kind" label="Art des Ortes">
        <Select id="kind" name="kind" defaultValue={v("kind") || "city"}>
          {PLACE_KINDS.map((k) => (
            <option key={k} value={k}>{PLACE_KIND_LABELS[k]}</option>
          ))}
        </Select>
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
      <Field
        id="timezone"
        label="Zeitzone"
        hint={
          derived
            ? "Aus dem Standort abgeleitet. Du kannst sie ändern."
            : "Wird aus dem Standort abgeleitet; Uhrzeiten im Tagesplan gelten in der Ortszeit."
        }
      >
        <Select
          id="timezone"
          name="timezone"
          value={timezone}
          onChange={(e) => {
            setTimezone(e.target.value);
            setDerived(false);
          }}
        >
          <option value="">– keine Angabe –</option>
          {zoneOptions(timezone).map((z) => (
            <option key={z.value} value={z.value}>{z.label}</option>
          ))}
        </Select>
      </Field>
      <LocationPicker
        key={`${v("lat")},${v("lng")},${v("addr_street")}`}
        initial={{
          lat: v("lat"),
          lng: v("lng"),
          label: v("place_label"),
          address: {
            street: v("addr_street"),
            house_number: v("addr_house_number"),
            postcode: v("addr_postcode"),
            city: v("addr_city"),
            region: v("addr_region"),
            country: v("addr_country"),
          },
        }}
        defaultQuery={v("name")}
        onPick={(h) => {
          if (h.timezone) {
            setTimezone(h.timezone);
            setDerived(true);
          }
        }}
      />
      <Field id="description" label="Beschreibung">
        <textarea id="description" name="description" defaultValue={v("description")} className={textarea} />
      </Field>

      <fieldset className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <legend className="px-1 text-sm font-medium">Unterkunft</legend>
        <Field id="lodging_name" label="Name">
          <Input id="lodging_name" name="lodging_name" defaultValue={v("lodging_name")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="lodging_checkin" label="Check-in ab">
            <TimeField id="lodging_checkin" name="lodging_checkin" defaultValue={v("lodging_checkin").slice(0, 5)} />
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
