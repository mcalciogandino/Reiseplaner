import type { Address } from "../geocode";
import { estimateTransfer, type Point } from "../estimate";
import { localToUtcIso, utcToLocalInput, type TransferKind } from "../transfers";
import type { Plan, PlanEndpoint, PlanPlace, PlanTransfer, Proposal } from "./plan";

export type KnownPlace = {
  id: string;
  name: string;
  timezone: string | null;
  lat: number | null;
  lng: number | null;
};

export type GeoHit = {
  lat: number;
  lng: number;
  timezone: string | null;
  label: string;
  address: Address;
};

export type Geocoder = (query: string) => Promise<GeoHit | null>;

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
/** Nur echte http(s)-Adressen, ohne Doppelte. */
function webUrls(list: readonly string[] | null | undefined): string[] {
  const out: string[] = [];
  for (const raw of list ?? []) {
    try {
      const u = new URL(raw.trim());
      if ((u.protocol === "http:" || u.protocol === "https:") && !out.includes(u.href)) out.push(u.href);
    } catch {
      /* ungültig: ignorieren */
    }
  }
  return out;
}
const orNull = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

/**
 * Macht aus dem Vorschlag der KI einen prüfbaren Plan: Standorte und Zeitzonen über die
 * Adresssuche, Dauer, Distanz und Ankunft geschätzt, wo der Text sie nicht nennt.
 * Unklares wird nicht geraten, sondern als Hinweis an der Zeile vermerkt.
 */
export async function buildPlan(
  proposal: Proposal,
  known: KnownPlace[],
  range: { start_date: string; end_date: string },
  geocode: Geocoder,
): Promise<Plan> {
  const memo = new Map<string, Promise<GeoHit | null>>();
  const lookup = (q: string) => {
    const key = norm(q);
    if (!memo.has(key)) memo.set(key, geocode(q).catch(() => null));
    return memo.get(key)!;
  };
  const outside = (d: string | null | undefined) => !!d && (d < range.start_date || d > range.end_date);

  const places: PlanPlace[] = [];
  for (const p of proposal.places) {
    const warnings: string[] = [];
    const hit = await lookup(p.search_query?.trim() || p.name);
    if (!hit) warnings.push("Kein Standort gefunden. Du kannst ihn später beim Ort suchen.");
    if (outside(p.arrival_date) || outside(p.departure_date)) warnings.push("Das Datum liegt ausserhalb der Reise.");
    if (p.arrival_date && p.departure_date && p.departure_date < p.arrival_date) {
      warnings.push("Die Abreise liegt vor der Ankunft.");
    }
    places.push({
      ref: p.ref,
      name: p.name,
      kind: p.kind,
      arrival_date: p.arrival_date ?? null,
      departure_date: p.departure_date ?? null,
      timezone: hit?.timezone ?? null,
      lat: hit?.lat ?? null,
      lng: hit?.lng ?? null,
      place_label: hit ? hit.label.slice(0, 200) : null,
      addr_street: orNull(hit?.address.street),
      addr_house_number: orNull(hit?.address.house_number),
      addr_postcode: orNull(hit?.address.postcode),
      addr_city: orNull(hit?.address.city),
      addr_region: orNull(hit?.address.region),
      addr_country: orNull(hit?.address.country),
      lodging_name: orNull(p.lodging_name),
      lodging_checkin: p.lodging_checkin ?? null,
      description: orNull(p.description),
      notes: orNull(p.notes),
      reason: orNull(p.reason),
      sources: webUrls(p.sources).slice(0, 3),
      warnings,
    });
  }
  // Ein Aufruf mit Abreise vor Ankunft würde das Speichern später ablehnen: lieber früh leeren.
  for (const p of places) {
    if (p.arrival_date && p.departure_date && p.departure_date < p.arrival_date) p.departure_date = null;
  }

  const byRef = new Map(places.map((p) => [p.ref, p]));

  async function endpoint(ref: string | null | undefined, text: string | null | undefined): Promise<PlanEndpoint> {
    const existing = ref ? known.find((k) => k.id === ref) : undefined;
    if (existing) {
      return { ref: null, existing_id: existing.id, place: null, label: existing.name, lat: existing.lat, lng: existing.lng, timezone: existing.timezone };
    }
    const created = ref ? byRef.get(ref) : undefined;
    if (created) {
      return { ref: created.ref, existing_id: null, place: null, label: created.name, lat: created.lat, lng: created.lng, timezone: created.timezone };
    }
    const name = orNull(text);
    if (name) {
      // Nennt der Text einen bekannten Ort beim Namen, wird dieser verwendet.
      const sameName = known.find((k) => norm(k.name) === norm(name));
      if (sameName) {
        return { ref: null, existing_id: sameName.id, place: null, label: sameName.name, lat: sameName.lat, lng: sameName.lng, timezone: sameName.timezone };
      }
      const sameNew = places.find((p) => norm(p.name) === norm(name));
      if (sameNew) {
        return { ref: sameNew.ref, existing_id: null, place: null, label: sameNew.name, lat: sameNew.lat, lng: sameNew.lng, timezone: sameNew.timezone };
      }
      const hit = await lookup(name);
      return { ref: null, existing_id: null, place: name, label: name, lat: hit?.lat ?? null, lng: hit?.lng ?? null, timezone: hit?.timezone ?? null };
    }
    return { ref: null, existing_id: null, place: null, label: "", lat: null, lng: null, timezone: null };
  }

  const transfers: PlanTransfer[] = [];
  for (const t of proposal.transfers) {
    const warnings: string[] = [];
    const from = await endpoint(t.from_ref, t.from_place);
    const to = await endpoint(t.to_ref, t.to_place);

    let departLocal = t.depart_local ?? null;
    let arriveLocal = t.arrive_local ?? null;
    const departTz = from.timezone;
    const arriveTz = to.timezone;
    if (departLocal && !departTz) {
      warnings.push("Abfahrtszeit nicht übernommen: Die Zeitzone des Startorts ist unbekannt.");
      departLocal = null;
    }
    if (arriveLocal && !arriveTz) {
      warnings.push("Ankunftszeit nicht übernommen: Die Zeitzone des Zielorts ist unbekannt.");
      arriveLocal = null;
    }

    let duration = t.duration_min ?? null;
    let distance = t.distance_km ?? null;
    let estimated = false;
    const a: Point | null = from.lat !== null && from.lng !== null ? { lat: from.lat, lng: from.lng } : null;
    const b: Point | null = to.lat !== null && to.lng !== null ? { lat: to.lat, lng: to.lng } : null;
    const est = a && b ? estimateTransfer(t.kind as TransferKind, a, b) : null;
    if (est) {
      if (duration === null) { duration = est.durationMin; estimated = true; }
      if (distance === null) { distance = est.distanceKm; estimated = true; }
    }
    if (!arriveLocal && departLocal && departTz && arriveTz && duration && duration > 0) {
      try {
        const ms = Date.parse(localToUtcIso(departLocal, departTz)) + duration * 60_000;
        arriveLocal = utcToLocalInput(new Date(ms).toISOString(), arriveTz);
        estimated = true;
      } catch {
        arriveLocal = null;
      }
    }
    if (departLocal && arriveLocal && departTz && arriveTz) {
      if (Date.parse(localToUtcIso(arriveLocal, arriveTz)) < Date.parse(localToUtcIso(departLocal, departTz))) {
        warnings.push("Die Ankunft liegt vor der Abfahrt. Bitte prüfen.");
        arriveLocal = null;
      }
    }
    if (outside(departLocal?.slice(0, 10)) || outside(arriveLocal?.slice(0, 10))) {
      warnings.push("Das Datum liegt ausserhalb der Reise.");
    }

    transfers.push({
      kind: t.kind,
      from,
      to,
      depart_local: departLocal,
      depart_tz: departLocal ? departTz : null,
      arrive_local: arriveLocal,
      arrive_tz: arriveLocal ? arriveTz : null,
      duration_min: duration,
      distance_km: distance,
      carrier: orNull(t.carrier),
      flight_number: orNull(t.flight_number),
      booking_ref: orNull(t.booking_ref),
      estimated,
      warnings,
    });
  }

  return { mode: "capture", summary: proposal.summary, places, transfers, questions: proposal.questions };
}
