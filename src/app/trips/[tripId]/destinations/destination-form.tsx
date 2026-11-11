"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { useActionState, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { LocationPicker } from "@/components/location-picker";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { TimeField } from "@/components/ui/date-time-field";
import { PLACE_KIND_DEFS } from "@/lib/destinations";
import { zoneOptions } from "@/lib/timezone";
import { dateBounds } from "@/lib/trips";
import type { DestinationFormState } from "./actions";
import { suggestDescription } from "./ai-actions";

type Initial = Partial<Record<string, string | number | null>>;

const textarea =
  "min-h-24 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-red-700 dark:border-neutral-700";

export function DestinationForm({
  tripId,
  action,
  range,
  initial = {},
  submitLabel,
  cancelHref,
}: {
  tripId: string;
  action: (prev: DestinationFormState, formData: FormData) => Promise<DestinationFormState>;
  range: { start_date: string; end_date: string };
  initial?: Initial;
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState<DestinationFormState, FormData>(action, null);
  const v = (k: string) => state?.values[k] ?? String(initial[k] ?? "");
  const [arrival, setArrival] = useState(v("arrival_date"));
  const [kind, setKind] = useState(v("kind") || "city");
  const [timezone, setTimezone] = useState(v("timezone"));
  const [derived, setDerived] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [description, setDescription] = useState(v("description"));
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [aiPending, startAi] = useTransition();

  function describe() {
    const fd = new FormData(formRef.current!);
    const g = (k: string) => String(fd.get(k) ?? "").trim();
    const dates = [g("arrival_date"), g("departure_date")].filter(Boolean).join(" bis ");
    startAi(async () => {
      const res = await suggestDescription({
        tripId,
        name: g("name"),
        kind: g("kind"),
        where: [g("addr_city"), g("addr_region"), g("addr_country")].filter(Boolean).join(", ") || g("place_label"),
        dates,
      });
      if (res.ok) {
        setDescription((cur) => (cur.trim() ? `${cur.trim()}\n\n${res.text}` : res.text));
        setAiNote("Vorschlag eingefügt. Prüfe und kürze ihn nach Bedarf; gespeichert wird erst mit «" + submitLabel + "».");
      } else {
        setAiNote(res.message);
      }
    });
  }
  const arrivalBounds = dateBounds(range, arrival);
  const departureBounds = dateBounds(range, v("departure_date"));

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <Field id="name" label="Ort">
        <Input id="name" name="name" required defaultValue={v("name")} placeholder="z. B. Whistler" />
      </Field>
      <Field id="kind" label="Art des Ortes">
        <Combobox
          id="kind"
          name="kind"
          value={kind}
          onChange={setKind}
          options={PLACE_KIND_DEFS.map((d) => ({ ...d }))}
        />
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
        <Combobox
          id="timezone"
          name="timezone"
          value={timezone}
          onChange={(z) => {
            setTimezone(z);
            setDerived(false);
          }}
          options={[{ value: "", label: "– keine Angabe –" }, ...zoneOptions(timezone)]}
        />
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
        <textarea
          id="description"
          name="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={2000}
          className={textarea}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" disabled={aiPending} onClick={describe}>
            <Sparkles aria-hidden="true" className="mr-2 size-4" />
            {aiPending ? "Die KI schreibt …" : "Mit KI beschreiben"}
          </Button>
          {aiNote && <p role="status" className="text-sm text-neutral-600 dark:text-neutral-400">{aiNote}</p>}
        </div>
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
