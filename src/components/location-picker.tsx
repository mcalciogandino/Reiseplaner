"use client";

import { MapPin } from "lucide-react";
import { useState, useTransition } from "react";
import { searchPlaces } from "@/app/geocode/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PlaceHit } from "@/lib/geocode";

type Chosen = { lat: string; lng: string; label: string };

/**
 * Adresssuche mit Trefferliste. Der gewählte Standort wird als versteckte Felder
 * (lat, lng, place_label) mit dem Formular abgeschickt.
 */
export function LocationPicker({
  initial,
  defaultQuery = "",
}: {
  initial: Chosen;
  defaultQuery?: string;
}) {
  const [chosen, setChosen] = useState<Chosen>(initial);
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
    setChosen({ lat: String(h.lat), lng: String(h.lng), label: h.label });
    setHits(null);
    setMessage("");
  }

  const hasLocation = chosen.lat !== "" && chosen.lng !== "";

  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <legend className="px-1 text-sm font-medium">Standort auf der Karte</legend>
      <input type="hidden" name="lat" value={chosen.lat} />
      <input type="hidden" name="lng" value={chosen.lng} />
      <input type="hidden" name="place_label" value={chosen.label} />

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
            onClick={() => setChosen({ lat: "", lng: "", label: "" })}
            className="min-h-11 shrink-0 px-2 text-sm underline"
          >
            Entfernen
          </button>
        </div>
      ) : (
        <p className="text-sm text-neutral-500">Noch kein Standort. Ohne Standort erscheint der Ort nicht auf der Karte.</p>
      )}
    </fieldset>
  );
}
