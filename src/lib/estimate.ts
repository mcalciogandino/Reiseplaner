import type { TransferKind } from "./transfers";

export type Point = { lat: number; lng: number };

/** Luftlinie in km (Haversine). */
export function haversineKm(a: Point, b: Point): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Faustwerte je Verkehrsmittel: Umwegfaktor (Strasse/Schiene länger als die Luftlinie),
 * Durchschnittsgeschwindigkeit in km/h und fester Zuschlag in Minuten
 * (Rollen, Start und Landung beim Flug).
 */
const PROFILES: Partial<Record<TransferKind, { detour: number; kmh: number; extraMin: number }>> = {
  flight: { detour: 1.0, kmh: 800, extraMin: 45 },
  drive: { detour: 1.3, kmh: 75, extraMin: 0 },
  train: { detour: 1.25, kmh: 90, extraMin: 0 },
  ferry: { detour: 1.1, kmh: 30, extraMin: 0 },
};

export type Estimate = { distanceKm: number; durationMin: number };

/** Schätzt Distanz und Dauer; null, wenn für die Art nichts sinnvoll zu schätzen ist. */
export function estimateTransfer(kind: TransferKind, from: Point, to: Point): Estimate | null {
  const p = PROFILES[kind];
  if (!p) return null;
  const km = haversineKm(from, to) * p.detour;
  const minutes = (km / p.kmh) * 60 + p.extraMin;
  return {
    distanceKm: Math.round(km),
    durationMin: Math.max(5, Math.round(minutes / 5) * 5),
  };
}
