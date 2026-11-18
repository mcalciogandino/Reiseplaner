"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DateTimeField } from "@/components/ui/date-time-field";
import { Field } from "@/components/ui/field";
import { LocationPicker } from "@/components/location-picker";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EMPTY_ADDRESS, type PlaceHit } from "@/lib/geocode";
import { zoneOptions } from "@/lib/timezone";
import { VEHICLE_LABELS } from "@/lib/vehicles";
import type { VehicleFormState } from "./actions";

export function VehicleForm({
  action,
  initial,
  submitLabel,
  cancelHref,
}: {
  action: (prev: VehicleFormState, fd: FormData) => Promise<VehicleFormState>;
  initial: Record<string, string>;
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const v = (k: string) => state?.values?.[k] ?? initial[k] ?? "";
  const [pickup, setPickup] = useState(v("pickup_local"));
  const [pickupTz, setPickupTz] = useState(v("pickup_tz"));
  const [ret, setRet] = useState(v("return_local"));
  const [retTz, setRetTz] = useState(v("return_tz"));
  const [pickupPlace, setPickupPlace] = useState(v("pickup_place"));
  const [returnPlace, setReturnPlace] = useState(v("return_place"));
  // Zuletzt automatisch gesetzter Name je Seite: nur den ersetzt ein neuer Treffer.
  const auto = useRef<{ pickup: string | null; return: string | null }>({ pickup: null, return: null });

  function onPickup(h: PlaceHit) {
    const name = h.name ?? h.label;
    if (name && (pickupPlace.trim() === "" || pickupPlace === auto.current.pickup)) {
      setPickupPlace(name);
      auto.current.pickup = name;
    }
    if (h.timezone) setPickupTz(h.timezone);
  }
  function onReturn(h: PlaceHit) {
    const name = h.name ?? h.label;
    if (name && (returnPlace.trim() === "" || returnPlace === auto.current.return)) {
      setReturnPlace(name);
      auto.current.return = name;
    }
    if (h.timezone) setRetTz(h.timezone);
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field id="kind" label="Art">
        <Select id="kind" name="kind" defaultValue={v("kind") || "car"}>
          {(Object.keys(VEHICLE_LABELS) as (keyof typeof VEHICLE_LABELS)[]).map((k) => (
            <option key={k} value={k}>{VEHICLE_LABELS[k]}</option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="provider" label="Vermieter">
          <Input id="provider" name="provider" defaultValue={v("provider")} placeholder="z. B. Avis" />
        </Field>
        <Field id="vehicle_name" label="Modell / Kategorie">
          <Input id="vehicle_name" name="vehicle_name" defaultValue={v("vehicle_name")} />
        </Field>
      </div>

      <fieldset className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <legend className="px-1 text-sm font-medium">Übernahme</legend>
        <Field id="pickup_place" label="Ort">
          <Input id="pickup_place" name="pickup_place" value={pickupPlace} onChange={(e) => setPickupPlace(e.target.value)} placeholder="z. B. Flughafen Vancouver" />
        </Field>
        <LocationPicker
          prefix="pickup_"
          key={`${v("pickup_lat")},${v("pickup_lng")}`}
          defaultQuery={pickupPlace}
          initial={{
            lat: v("pickup_lat"),
            lng: v("pickup_lng"),
            label: v("pickup_place_label"),
            address: {
              ...EMPTY_ADDRESS,
              street: v("pickup_addr_street"),
              house_number: v("pickup_addr_house_number"),
              postcode: v("pickup_addr_postcode"),
              city: v("pickup_addr_city"),
              region: v("pickup_addr_region"),
              country: v("pickup_addr_country"),
            },
          }}
          onPick={onPickup}
        />
        <Field id="pickup_local" label="Datum und Uhrzeit (Ortszeit, 24 h)">
          <DateTimeField id="pickup_local" name="pickup_local" value={pickup} onChange={setPickup} />
        </Field>
        <Field id="pickup_tz" label="Zeitzone">
          <Combobox
            id="pickup_tz"
            name="pickup_tz"
            value={pickupTz}
            onChange={setPickupTz}
            placeholder="Zeitzone tippen …"
            options={[{ value: "", label: "– wählen –" }, ...zoneOptions(pickupTz)]}
          />
        </Field>
      </fieldset>

      <fieldset className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <legend className="px-1 text-sm font-medium">Rückgabe</legend>
        <Field id="return_place" label="Ort">
          <Input id="return_place" name="return_place" value={returnPlace} onChange={(e) => setReturnPlace(e.target.value)} />
        </Field>
        <LocationPicker
          prefix="return_"
          key={`${v("return_lat")},${v("return_lng")}`}
          defaultQuery={returnPlace}
          initial={{
            lat: v("return_lat"),
            lng: v("return_lng"),
            label: v("return_place_label"),
            address: {
              ...EMPTY_ADDRESS,
              street: v("return_addr_street"),
              house_number: v("return_addr_house_number"),
              postcode: v("return_addr_postcode"),
              city: v("return_addr_city"),
              region: v("return_addr_region"),
              country: v("return_addr_country"),
            },
          }}
          onPick={onReturn}
        />
        <Field id="return_local" label="Datum und Uhrzeit (Ortszeit, 24 h)">
          <DateTimeField id="return_local" name="return_local" value={ret} onChange={setRet} />
        </Field>
        <Field id="return_tz" label="Zeitzone">
          <Combobox
            id="return_tz"
            name="return_tz"
            value={retTz}
            onChange={setRetTz}
            placeholder="Zeitzone tippen …"
            options={[{ value: "", label: "– wählen –" }, ...zoneOptions(retTz)]}
          />
        </Field>
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="booked" defaultChecked={v("booked") === "on"} className="size-5 accent-green-700" />
          Gebucht
        </label>
        <Field id="booking_ref" label="Buchungsnummer">
          <Input id="booking_ref" name="booking_ref" defaultValue={v("booking_ref")} />
        </Field>
        <Field id="price" label="Preis (gesamt)">
          <Input id="price" name="price" inputMode="decimal" defaultValue={v("price")} />
        </Field>
        <Field id="currency" label="Währung">
          <Input id="currency" name="currency" maxLength={3} defaultValue={v("currency")} placeholder="CAD" />
        </Field>
      </div>
      <Field id="notes" label="Notizen">
        <Input id="notes" name="notes" maxLength={500} defaultValue={v("notes")} />
      </Field>

      {state?.message && <p role="alert" className="text-sm text-red-700">{state.message}</p>}
      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Speichere …" : submitLabel}</Button>
        <Link href={cancelHref} className="inline-flex min-h-11 items-center px-2 text-sm underline">Abbrechen</Link>
      </div>
    </form>
  );
}
