import { searchPlaces } from "@/app/geocode/actions";
import type { GeoHit } from "./build-plan";

/** Erster Treffer der Adresssuche für buildPlan, oder null. */
export async function geocodeFirst(query: string): Promise<GeoHit | null> {
  const res = await searchPlaces(query);
  const hit = res.ok ? res.hits[0] : undefined;
  return hit
    ? { lat: hit.lat, lng: hit.lng, timezone: hit.timezone, label: hit.label, address: hit.address }
    : null;
}
