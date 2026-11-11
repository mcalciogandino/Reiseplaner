import { z } from "zod";

/** Strukturierte Adresse; leere Felder sind leere Zeichenketten (Formularwerte). */
export type Address = {
  street: string;
  house_number: string;
  postcode: string;
  city: string;
  region: string;
  country: string;
};

export const EMPTY_ADDRESS: Address = {
  street: "", house_number: "", postcode: "", city: "", region: "", country: "",
};

export type PlaceHit = {
  label: string;
  lat: number;
  lng: number;
  kind: string | null;
  address: Address;
};

const nominatimItem = z.object({
  lat: z.string(),
  lon: z.string(),
  display_name: z.string(),
  type: z.string().optional(),
  addresstype: z.string().optional(),
  address: z.record(z.string(), z.unknown()).optional(),
});

/** Ordnet die Nominatim-Adressteile unseren Feldern zu (erstes vorhandenes Feld gewinnt). */
export function parseAddress(raw: Record<string, unknown> | undefined): Address {
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = raw?.[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  };
  return {
    street: pick("road", "pedestrian", "footway", "path", "cycleway"),
    house_number: pick("house_number"),
    postcode: pick("postcode"),
    city: pick("city", "town", "village", "hamlet", "municipality", "suburb", "county"),
    region: pick("state", "province", "region", "state_district"),
    country: pick("country"),
  };
}

/** Rundet auf 6 Nachkommastellen (numeric(9,6) in der Datenbank). */
export function roundCoord(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

export function isValidCoord(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
  );
}

/** Wandelt die Antwort von Nominatim in unsere Treffer um; ungültige Einträge entfallen. */
export function parseNominatim(json: unknown): PlaceHit[] {
  if (!Array.isArray(json)) return [];
  const hits: PlaceHit[] = [];
  for (const raw of json) {
    const item = nominatimItem.safeParse(raw);
    if (!item.success) continue;
    const lat = Number(item.data.lat);
    const lng = Number(item.data.lon);
    if (!isValidCoord(lat, lng)) continue;
    hits.push({
      label: item.data.display_name.slice(0, 200),
      lat: roundCoord(lat),
      lng: roundCoord(lng),
      kind: item.data.addresstype ?? item.data.type ?? null,
      address: parseAddress(item.data.address),
    });
  }
  return hits;
}

/** Gleiche Suchen (Gross-/Kleinschreibung, Leerzeichen) teilen sich einen Zwischenspeicher-Eintrag. */
export function cacheKey(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}
