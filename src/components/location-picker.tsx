"use client";

import { MapPin } from "lucide-react";
import { useState, useTransition } from "react";
import { searchPlaces } from "@/app/geocode/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { EMPTY_ADDRESS, type Address, type PlaceHit } from "@/lib/geocode";

type Chosen = { lat: string; lng: string; label: string; address: Address };

/**
 * Adresssuche mit Trefferliste. Der gewählte Standort wird als versteckte Felder
 * (lat, lng, place_label) mit dem Formular abgeschickt.
 */
export function LocationPicker({
  initial,
  defaultQuery = "",
  prefix = "",
  onPick,
  onClear,
}: {
  initial: Chosen;
  defaultQuery?: string;
  /** Präfix für Feldnamen, wenn mehrere Picker in einem Formular stehen (z. B. "from_new_"). */
  prefix?: string;
  /** Wird nach der Wahl eines Treffers aufgerufen (Koordinaten, abgeleitete Zeitzone). */
  onPick?: (hit: PlaceHit) => void;
  onClear?: () => void;
}) {
  const [chosen, setChosen] = useState<Chosen>(initial);
  const [address, setAddress] = useState<Address>(initial.address);
  const setField = (k: keyof Address) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setAddress((a) => ({ ...a, [k]: e.target.value }));
  const [query, setQuery] = useState(initial.label || defaultQuery);
  const [hits, setHits] = useState<PlaceHit[] | null>(null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function search() {
    setMessage("");
    startTransition(async () => {
      const res = await searchPlaces(query);
      if (!res.ok) {
        setHits(null);
        setMessage(res.message);
        return;
      }
      setHits(res.hits);
      if (res.hits.length === 0) setMessage("Nichts gefunden. Versuche es mit Ort und Land.");
    });
  }

  function pick(h: PlaceHit) {
    setChosen({ lat: String(h.lat), lng: String(h.lng), label: h.label, address: h.address });
    setAddress(h.address);
    onPick?.(h);
    setHits(null);
    setMessage("");
  }

  const hasLocation = chosen.lat !== "" && chosen.lng !== "";

  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <legend className="px-1 text-sm font-medium">Standort auf der Karte</legend>
      <input type="hidden" name={`${prefix}lat`} value={chosen.lat} />
      <input type="hidden" name={`${prefix}lng`} value={chosen.lng} />
      <input type="hidden" name={`${prefix}place_label`} value={chosen.label} />

      <div className="flex gap-2">
        <Input
          aria-label="Adresse oder Ort suchen"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              search();
            }
          }}
          placeholder="Adresse oder Ort, z. B. Whistler BC"
        />
        <Button type="button" variant="outline" onClick={search} disabled={pending || query.trim().length < 3}>
          {pending ? "Suche …" : "Suchen"}
        </Button>
      </div>

      <div aria-live="polite" className="text-sm">
        {message && <p className="text-neutral-600 dark:text-neutral-400">{message}</p>}
      </div>

      {hits && hits.length > 0 && (
        <ul className="flex flex-col gap-1" aria-label="Treffer">
          {hits.map((h) => (
            <li key={`${h.lat},${h.lng},${h.label}`}>
              <button
                type="button"
                onClick={() => pick(h)}
                className="flex min-h-11 w-full items-start gap-2 rounded-lg border border-neutral-300 px-3 py-2 text-left text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
              >
                <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-red-700" />
                <span>{h.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {hasLocation ? (
        <div className="flex items-start justify-between gap-3 rounded-lg bg-neutral-100 p-3 text-sm dark:bg-neutral-800">
          <div>
            <p className="font-medium">Standort gesetzt</p>
            <p className="text-neutral-600 dark:text-neutral-400">{chosen.label || "Ohne Beschriftung"}</p>
            <p className="text-xs text-neutral-500">
              {chosen.lat}, {chosen.lng}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setChosen({ lat: "", lng: "", label: "", address: EMPTY_ADDRESS });
              setAddress(EMPTY_ADDRESS);
              onClear?.();
            }}
            className="min-h-11 shrink-0 px-2 text-sm underline"
          >
            Entfernen
          </button>
        </div>
      ) : (
        <p className="text-sm text-neutral-500">Noch kein Standort. Ohne Standort erscheint der Ort nicht auf der Karte.</p>
      )}

      <div className="flex flex-col gap-4 border-t border-neutral-200 pt-4 dark:border-neutral-800">
        <p className="text-sm font-medium">Adresse</p>
        <p className="-mt-3 text-sm text-neutral-600 dark:text-neutral-400">
          Wird bei der Suche ausgefüllt und lässt sich von Hand anpassen.
        </p>
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <Field id={`${prefix}addr_street`} label="Strasse">
            <Input id={`${prefix}addr_street`} name={`${prefix}addr_street`} autoComplete="off" value={address.street} onChange={setField("street")} />
          </Field>
          <Field id={`${prefix}addr_house_number`} label="Nr.">
            <Input id={`${prefix}addr_house_number`} name={`${prefix}addr_house_number`} autoComplete="off" value={address.house_number} onChange={setField("house_number")} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
          <Field id={`${prefix}addr_postcode`} label="PLZ">
            <Input id={`${prefix}addr_postcode`} name={`${prefix}addr_postcode`} autoComplete="off" value={address.postcode} onChange={setField("postcode")} />
          </Field>
          <Field id={`${prefix}addr_city`} label="Ort / Stadt">
            <Input id={`${prefix}addr_city`} name={`${prefix}addr_city`} autoComplete="off" value={address.city} onChange={setField("city")} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={`${prefix}addr_region`} label="Provinz / Bundesstaat">
            <Input id={`${prefix}addr_region`} name={`${prefix}addr_region`} autoComplete="off" value={address.region} onChange={setField("region")} />
          </Field>
          <Field id={`${prefix}addr_country`} label="Land">
            <Input id={`${prefix}addr_country`} name={`${prefix}addr_country`} autoComplete="off" value={address.country} onChange={setField("country")} />
          </Field>
        </div>
      </div>
    </fieldset>
  );
}
