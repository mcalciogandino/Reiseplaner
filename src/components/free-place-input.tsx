"use client";

import { MapPin } from "lucide-react";
import { useState, useTransition } from "react";
import { searchPlaces } from "@/app/geocode/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { PlaceHit } from "@/lib/geocode";

/**
 * Freier Ort einer Verschiebung (Flughafen, Bahnhof …) mit Suche: Der Treffer liefert
 * Koordinaten und Zeitzone, damit Distanz, Dauer und Ankunft geschätzt werden können.
 * Felder: `${side}_place`, `${side}_lat`, `${side}_lng`.
 */
export function FreePlaceInput({
  side,
  hint,
  initial,
  onChange,
}: {
  side: "from" | "to";
  hint: string;
  initial: { label: string; lat: string; lng: string };
  /** Koordinaten (oder null, wenn entfernt) und ggf. die abgeleitete Zeitzone. */
  onChange: (point: { lat: number; lng: number } | null, timezone: string | null) => void;
}) {
  const [label, setLabel] = useState(initial.label);
  const [coords, setCoords] = useState({ lat: initial.lat, lng: initial.lng });
  const [hits, setHits] = useState<PlaceHit[] | null>(null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const id = `${side}_place`;

  function search() {
    setMessage("");
    startTransition(async () => {
      const res = await searchPlaces(label);
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
    // Kurze Beschriftung: erster Teil des Treffers (z. B. «Flughafen Zürich»).
    setLabel(h.label.split(",")[0]);
    setCoords({ lat: String(h.lat), lng: String(h.lng) });
    setHits(null);
    onChange({ lat: h.lat, lng: h.lng }, h.timezone);
  }

  const located = coords.lat !== "" && coords.lng !== "";

  return (
    <Field id={id} label="oder freier Ort" hint={hint}>
      <input type="hidden" name={`${side}_lat`} value={coords.lat} />
      <input type="hidden" name={`${side}_lng`} value={coords.lng} />
      <div className="flex gap-2">
        <Input
          id={id}
          name={id}
          value={label}
          autoComplete="off"
          onChange={(e) => {
            setLabel(e.target.value);
            if (located) {
              setCoords({ lat: "", lng: "" });
              onChange(null, null);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (label.trim().length >= 3) search();
            }
          }}
        />
        <Button type="button" variant="outline" onClick={search} disabled={pending || label.trim().length < 3}>
          {pending ? "Suche …" : "Suchen"}
        </Button>
      </div>
      <div aria-live="polite" className="text-sm">
        {message && <p className="text-neutral-600 dark:text-neutral-400">{message}</p>}
        {located && !hits && <p className="text-neutral-600 dark:text-neutral-400">Standort gesetzt</p>}
      </div>
      {hits && hits.length > 0 && (
        <ul className="mt-1 flex flex-col gap-1" aria-label="Treffer">
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
    </Field>
  );
}
