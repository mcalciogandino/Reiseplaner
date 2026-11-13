"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { FreePlaceInput } from "@/components/free-place-input";
import { DateTimeField } from "@/components/ui/date-time-field";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { LocationPicker } from "@/components/location-picker";
import { Combobox } from "@/components/ui/combobox";
import { Select } from "@/components/ui/select";
import { EMPTY_ADDRESS } from "@/lib/geocode";
import { NEW_PLACE } from "@/lib/place-fields";
import { PLACE_KIND_DEFS } from "@/lib/destinations";
import { estimateTransfer, type Point } from "@/lib/estimate";
import { zoneOptions } from "@/lib/timezone";
import { KIND_LABELS, KINDS, localToUtcIso, utcToLocalInput, type TransferKind } from "@/lib/transfers";
import { dateTimeBounds } from "@/lib/trips";
import type { TransferFormState } from "./actions";

export type StopOption = {
  id: string;
  name: string;
  timezone: string | null;
  lat: number | null;
  lng: number | null;
};

const toPoint = (lat: string, lng: string): Point | null =>
  lat !== "" && lng !== "" && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
    ? { lat: Number(lat), lng: Number(lng) }
    : null;


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

  const [kind, setKind] = useState(v("kind") || "flight");
  const [departTz, setDepartTz] = useState(v("depart_tz"));
  const [arriveTz, setArriveTz] = useState(v("arrive_tz"));
  const [departLocal, setDepartLocal] = useState(v("depart_local"));
  const [arriveLocal, setArriveLocal] = useState(v("arrive_local"));
  const [duration, setDuration] = useState(v("duration_min"));
  const [distance, setDistance] = useState(v("distance_km"));
  // «Überschrieben»: Sobald jemand ein Feld selbst ändert, wird es nicht mehr geschätzt.
  const [touched, setTouched] = useState({
    duration: v("duration_min") !== "",
    distance: v("distance_km") !== "",
    arrive: v("arrive_local") !== "",
  });
  const [freeFrom, setFreeFrom] = useState(toPoint(v("from_lat"), v("from_lng")));
  const [freeTo, setFreeTo] = useState(toPoint(v("to_lat"), v("to_lng")));
  const [newFrom, setNewFrom] = useState(toPoint(v("from_new_lat"), v("from_new_lng")));
  const [newTo, setNewTo] = useState(toPoint(v("to_new_lat"), v("to_new_lng")));
  const departBounds = dateTimeBounds(range, departLocal);
  const arriveBounds = dateTimeBounds(range, arriveLocal);
  const tzOf = (id: string) => stops.find((s) => s.id === id)?.timezone ?? "";
  const [kinds, setKinds] = useState({
    from: v("from_new_kind") || "city",
    to: v("to_new_kind") || "city",
  });
  const [fromSel, setFromSel] = useState(v("from_destination_id"));
  const [toSel, setToSel] = useState(v("to_destination_id"));

  const pointOf = (sel: string, free: Point | null, created: Point | null): Point | null => {
    if (sel === NEW_PLACE) return created;
    const stop = stops.find((x) => x.id === sel);
    if (stop) return stop.lat !== null && stop.lng !== null ? { lat: stop.lat, lng: stop.lng } : null;
    return free;
  };
  const from = pointOf(fromSel, freeFrom, newFrom);
  const to = pointOf(toSel, freeTo, newTo);
  const estimate = from && to ? estimateTransfer(kind as TransferKind, from, to) : null;

  const durationValue = !touched.duration && estimate ? String(estimate.durationMin) : duration;
  const distanceValue = !touched.distance && estimate ? String(estimate.distanceKm) : distance;

  // Ankunft = Abfahrt + Dauer, umgerechnet von der Zeitzone des Starts in die des Ziels.
  let estimatedArrive = "";
  const minutes = Number(durationValue);
  if (!touched.arrive && departLocal.length === 16 && departTz && arriveTz && minutes > 0) {
    try {
      const ms = Date.parse(localToUtcIso(departLocal, departTz)) + minutes * 60_000;
      estimatedArrive = utcToLocalInput(new Date(ms).toISOString(), arriveTz);
    } catch {
      estimatedArrive = "";
    }
  }
  const arriveValue = touched.arrive ? arriveLocal : estimatedArrive || arriveLocal;
  const isEstimated =
    (!touched.duration && estimate !== null) ||
    (!touched.distance && estimate !== null) ||
    (!touched.arrive && estimatedArrive !== "");
  const anyTouched = touched.duration || touched.distance || touched.arrive;

  const stopSelect = (
    name: string,
    label: string,
    value: string,
    setValue: (v: string) => void,
    onPick: (tz: string) => void,
  ) => (
    <Field id={name} label={label}>
      <Combobox
        id={name}
        name={name}
        value={value}
        onChange={(id) => {
          setValue(id);
          const tz = tzOf(id);
          if (tz) onPick(tz);
        }}
        placeholder="Ort tippen oder auswählen …"
        options={[
          { value: "", label: "– keiner (freier Ort) –", pinned: true },
          ...stops.map((x) => ({ value: x.id, label: x.name })),
          { value: NEW_PLACE, label: "＋ Neuer Ort anlegen …", pinned: true },
        ]}
      />
    </Field>
  );

  /** Angaben zu einem Ort, der mit der Verschiebung zusammen angelegt wird. */
  const newPlace = (
    side: "from" | "to",
    onTimezone: (tz: string) => void,
    setPoint: (p: Point | null) => void,
  ) => {
    const p = `${side}_new_`;
    return (
      <div className="flex flex-col gap-4 rounded-lg bg-neutral-100 p-4 dark:bg-neutral-900">
        <p className="text-sm font-medium">Neuer Ort</p>
        <p className="-mt-2 text-xs text-neutral-500">Die Zeitzone wird aus dem Standort abgeleitet (unten bei der Uhrzeit änderbar).</p>
        <Field id={`${p}name`} label="Name">
          <Input id={`${p}name`} name={`${p}name`} required defaultValue={v(`${p}name`)} placeholder="z. B. Whistler" />
        </Field>
        <Field id={`${p}kind`} label="Art des Ortes">
          <Combobox
            id={`${p}kind`}
            name={`${p}kind`}
            value={kinds[side]}
            onChange={(k) => setKinds((x) => ({ ...x, [side]: k }))}
            options={PLACE_KIND_DEFS.map((d) => ({ ...d }))}
          />
        </Field>
        <input type="hidden" name={`${p}timezone`} value={side === "from" ? departTz : arriveTz} />
        <LocationPicker
          prefix={p}
          key={`${v(`${p}lat`)},${v(`${p}lng`)},${v(`${p}addr_street`)}`}
          defaultQuery={v(`${p}name`)}
          onPick={(h) => {
            setPoint({ lat: h.lat, lng: h.lng });
            if (h.timezone) onTimezone(h.timezone);
          }}
          onClear={() => setPoint(null)}
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
      <Combobox
        id={name}
        name={name}
        value={value}
        onChange={set}
        placeholder="Zeitzone tippen …"
        options={[{ value: "", label: "– wählen –" }, ...zoneOptions(value)]}
      />
    </Field>
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field id="kind" label="Art">
        <Select id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          {KINDS.map((k) => (
            <option key={k} value={k}>{KIND_LABELS[k]}</option>
          ))}
        </Select>
      </Field>

      <fieldset className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <legend className="px-1 text-sm font-medium">Von</legend>
        {stopSelect("from_destination_id", "Reiseort", fromSel, setFromSel, setDepartTz)}
        {fromSel === NEW_PLACE ? (
          newPlace("from", setDepartTz, setNewFrom)
        ) : (
          <FreePlaceInput
            side="from"
            hint="z. B. Flughafen Zürich. Mit «Suchen» werden Standort und Zeitzone übernommen."
            initial={{ label: v("from_place"), lat: v("from_lat"), lng: v("from_lng") }}
            onChange={(pt, tz) => {
              setFreeFrom(pt);
              if (tz) setDepartTz(tz);
            }}
          />
        )}
        <div className="grid gap-4">
          <Field id="depart_local" label="Abfahrt (Ortszeit, 24 h)">
            <DateTimeField
              id="depart_local"
              name="depart_local"
              value={departLocal}
              onChange={setDepartLocal}
              min={departBounds.min}
              max={departBounds.max}
            />
          </Field>
          {tzSelect("depart_tz", departTz, setDepartTz)}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <legend className="px-1 text-sm font-medium">Nach</legend>
        {stopSelect("to_destination_id", "Reiseort", toSel, setToSel, setArriveTz)}
        {toSel === NEW_PLACE ? (
          newPlace("to", setArriveTz, setNewTo)
        ) : (
          <FreePlaceInput
            side="to"
            hint="z. B. Flughafen Vancouver. Mit «Suchen» werden Standort und Zeitzone übernommen."
            initial={{ label: v("to_place"), lat: v("to_lat"), lng: v("to_lng") }}
            onChange={(pt, tz) => {
              setFreeTo(pt);
              if (tz) setArriveTz(tz);
            }}
          />
        )}
        <div className="grid gap-4">
          <Field
            id="arrive_local"
            label="Ankunft (Ortszeit, 24 h)"
            hint={!touched.arrive && estimatedArrive ? "Geschätzt aus Abfahrt und Dauer. Du kannst sie ändern." : undefined}
          >
            <DateTimeField
              id="arrive_local"
              name="arrive_local"
              value={arriveValue}
              onChange={(v2) => {
                setArriveLocal(v2);
                setTouched((t) => ({ ...t, arrive: true }));
              }}
              min={departLocal && departLocal <= arriveBounds.max ? departLocal : arriveBounds.min}
              max={arriveBounds.max}
            />
          </Field>
          {tzSelect("arrive_tz", arriveTz, setArriveTz)}
        </div>
      </fieldset>

      {(isEstimated || (anyTouched && estimate)) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-900">
          <p className="text-neutral-600 dark:text-neutral-400">
            Dauer, Distanz und Ankunft sind Schätzungen aus Verkehrsmittel und Luftlinie.
          </p>
          {anyTouched && estimate && (
            <button
              type="button"
              className="min-h-11 px-2 underline"
              onClick={() => {
                setTouched({ duration: false, distance: false, arrive: false });
                setArriveLocal("");
              }}
            >
              Neu schätzen
            </button>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="duration_min"
          label="Dauer (Minuten)"
          hint={!touched.duration && estimate ? "Geschätzt. Du kannst sie ändern." : "Nur nötig, wenn Abfahrt oder Ankunft fehlen."}
        >
          <Input
            id="duration_min"
            name="duration_min"
            type="number"
            min={0}
            inputMode="numeric"
            value={durationValue}
            onChange={(e) => {
              setDuration(e.target.value);
              setTouched((t) => ({ ...t, duration: true }));
            }}
          />
        </Field>
        <Field
          id="distance_km"
          label="Distanz (km)"
          hint={!touched.distance && estimate ? "Geschätzt (Luftlinie mit Umwegfaktor). Du kannst sie ändern." : undefined}
        >
          <Input
            id="distance_km"
            name="distance_km"
            type="number"
            min={0}
            inputMode="numeric"
            value={distanceValue}
            onChange={(e) => {
              setDistance(e.target.value);
              setTouched((t) => ({ ...t, distance: true }));
            }}
          />
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
        <Field id="price" label="Preis" hint="Für alle zusammen">
          <Input id="price" name="price" inputMode="decimal" defaultValue={v("price")} placeholder="z. B. 40" />
        </Field>
        <Field id="currency" label="Währung">
          <Input id="currency" name="currency" maxLength={3} defaultValue={v("currency")} placeholder="CAD" />
        </Field>
        <Field id="notes" label="Hinweis" hint="z. B. Linie, Takt, Haltestelle">
          <Input id="notes" name="notes" maxLength={500} defaultValue={v("notes")} />
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
