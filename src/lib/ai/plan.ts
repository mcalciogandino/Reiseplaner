import { z } from "zod";
import { PLACE_KINDS } from "../destinations";
import { KINDS } from "../transfers";
import { isValidTimeZone } from "../timezone";

const date = z.iso.date();
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);

// ---------- Vorschlag der KI (Eingabe des Werkzeugs; lenient, nullish) ----------

const proposedPlace = z.object({
  ref: z.string().min(1).max(30),
  name: z.string().trim().min(1).max(100),
  kind: z.enum(PLACE_KINDS as [string, ...string[]]),
  search_query: z.string().trim().max(200).nullish(),
  arrival_date: date.nullish(),
  departure_date: date.nullish(),
  lodging_name: z.string().trim().max(150).nullish(),
  lodging_checkin: time.nullish(),
  description: z.string().trim().max(2000).nullish(),
  notes: z.string().trim().max(2000).nullish(),
  /** Nur im Suchmodus: warum der Ort empfohlen wird, und Quellen (Web-Adressen). */
  reason: z.string().trim().max(600).nullish(),
  sources: z.array(z.string().max(500)).max(5).nullish(),
});

const proposedTransfer = z.object({
  kind: z.enum(KINDS as [string, ...string[]]),
  from_ref: z.string().max(60).nullish(),
  from_place: z.string().trim().max(150).nullish(),
  to_ref: z.string().max(60).nullish(),
  to_place: z.string().trim().max(150).nullish(),
  depart_local: localDateTime.nullish(),
  arrive_local: localDateTime.nullish(),
  carrier: z.string().trim().max(100).nullish(),
  flight_number: z.string().trim().max(30).nullish(),
  booking_ref: z.string().trim().max(100).nullish(),
  distance_km: z.number().int().min(0).max(100000).nullish(),
  duration_min: z.number().int().min(0).max(100000).nullish(),
});

export const proposalSchema = z.object({
  summary: z.string().trim().max(1000).default(""),
  places: z.array(proposedPlace).max(30).default([]),
  transfers: z.array(proposedTransfer).max(40).default([]),
  questions: z.array(z.string().trim().max(300)).max(10).default([]),
});
export type Proposal = z.infer<typeof proposalSchema>;

// ---------- Geprüfter Plan (nach Standortsuche und Schätzung; Vorschau und Speichern) ----------

const nullableText = (max: number) => z.string().trim().max(max).nullable();
const zone = z.string().nullable().refine((v) => v === null || isValidTimeZone(v), "Ungültige Zeitzone.");

export const planPlaceSchema = z.object({
  ref: z.string().min(1).max(30),
  name: z.string().trim().min(1).max(100),
  kind: z.enum(PLACE_KINDS as [string, ...string[]]),
  arrival_date: date.nullable(),
  departure_date: date.nullable(),
  timezone: zone,
  lat: lat.nullable(),
  lng: lng.nullable(),
  place_label: nullableText(200),
  addr_street: nullableText(150),
  addr_house_number: nullableText(20),
  addr_postcode: nullableText(20),
  addr_city: nullableText(100),
  addr_region: nullableText(100),
  addr_country: nullableText(100),
  lodging_name: nullableText(150),
  lodging_checkin: time.nullable(),
  description: nullableText(2000),
  notes: nullableText(2000),
  reason: nullableText(600).default(null),
  sources: z.array(z.url().max(500).refine((u) => /^https?:\/\//i.test(u), "Nur http(s)")).max(3).default([]),
  warnings: z.array(z.string().max(300)).max(10),
});
export type PlanPlace = z.infer<typeof planPlaceSchema>;

export const planEndpointSchema = z.object({
  /** Neuer Ort aus diesem Plan (ref) oder bestehender Ort (existing_id) oder freier Ort (place). */
  ref: z.string().max(30).nullable(),
  existing_id: z.uuid().nullable(),
  place: nullableText(150),
  label: z.string().max(200),
  lat: lat.nullable(),
  lng: lng.nullable(),
  timezone: zone,
});
export type PlanEndpoint = z.infer<typeof planEndpointSchema>;

export const planTransferSchema = z.object({
  kind: z.enum(KINDS as [string, ...string[]]),
  from: planEndpointSchema,
  to: planEndpointSchema,
  depart_local: localDateTime.nullable(),
  depart_tz: zone,
  arrive_local: localDateTime.nullable(),
  arrive_tz: zone,
  duration_min: z.number().int().min(0).max(100000).nullable(),
  distance_km: z.number().int().min(0).max(100000).nullable(),
  carrier: nullableText(100),
  flight_number: nullableText(30),
  booking_ref: nullableText(100),
  /** true: Dauer/Distanz/Ankunft sind geschätzt, nicht aus dem Text. */
  estimated: z.boolean(),
  warnings: z.array(z.string().max(300)).max(10),
});
export type PlanTransfer = z.infer<typeof planTransferSchema>;

export const planSchema = z.object({
  /** capture: aus Text erfasst (vorausgewählt); search: Recherche-Vorschläge (nichts vorausgewählt). */
  mode: z.enum(["capture", "search"]).default("capture"),
  summary: z.string().max(1000),
  places: z.array(planPlaceSchema).max(30),
  transfers: z.array(planTransferSchema).max(40),
  questions: z.array(z.string().max(300)).max(10),
});
export type Plan = z.infer<typeof planSchema>;
