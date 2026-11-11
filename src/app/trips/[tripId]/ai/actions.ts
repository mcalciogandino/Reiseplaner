"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { searchPlaces } from "@/app/geocode/actions";
import { buildPlan, type GeoHit, type KnownPlace } from "@/lib/ai/build-plan";
import { proposeFromText } from "@/lib/ai/claude";
import { planSchema, type Plan, type PlanEndpoint } from "@/lib/ai/plan";
import { tripContext } from "@/lib/ai/prompt";
import { storeRoute } from "@/lib/route-store";
import { createClient } from "@/lib/supabase/server";
import { KIND_LABELS, localToUtcIso, type TransferKind } from "@/lib/transfers";
import { TRIP_COLUMNS, type Trip } from "@/lib/trips";

export type AiState = { text: string; message?: string; plan?: Plan } | null;

const uuid = z.uuid();
const MAX_TEXT = 8000;

async function geocode(query: string): Promise<GeoHit | null> {
  const res = await searchPlaces(query);
  const hit = res.ok ? res.hits[0] : undefined;
  return hit
    ? { lat: hit.lat, lng: hit.lng, timezone: hit.timezone, label: hit.label, address: hit.address }
    : null;
}

/** Schritt 1: Text lesen lassen und einen prüfbaren Vorschlag erstellen (nichts wird gespeichert). */
export async function proposeEntries(
  tripId: string,
  _prev: AiState,
  formData: FormData,
): Promise<AiState> {
  const text = String(formData.get("text") ?? "").trim();
  if (!uuid.safeParse(tripId).success) return { text, message: "Ungültige Reise." };
  if (text.length < 10) return { text, message: "Bitte beschreibe etwas genauer, was eingetragen werden soll." };
  if (text.length > MAX_TEXT) return { text, message: `Der Text ist zu lang (höchstens ${MAX_TEXT} Zeichen).` };

  const supabase = await createClient();
  const { data: trip } = await supabase.from("trips").select(TRIP_COLUMNS).eq("id", tripId).maybeSingle<Trip>();
  if (!trip) return { text, message: "Reise nicht gefunden." };

  const [{ data: stops }, { data: legs }] = await Promise.all([
    supabase
      .from("destinations")
      .select("id, name, timezone, lat, lng, arrival_date, departure_date")
      .eq("trip_id", tripId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("transfers")
      .select("kind, from_destination_id, to_destination_id, from_place, to_place, depart_at")
      .eq("trip_id", tripId),
  ]);
  const places = (stops ?? []) as (KnownPlace & { arrival_date: string | null; departure_date: string | null })[];
  const name = new Map(places.map((p) => [p.id, p.name]));

  const context = tripContext({
    name: trip.name,
    start_date: trip.start_date,
    end_date: trip.end_date,
    places,
    transfers: (legs ?? []).map((t) => ({
      kind: KIND_LABELS[t.kind as TransferKind] ?? t.kind,
      from: (t.from_destination_id && name.get(t.from_destination_id)) || t.from_place || "",
      to: (t.to_destination_id && name.get(t.to_destination_id)) || t.to_place || "",
      depart: t.depart_at,
    })),
  });

  const result = await proposeFromText(text, context);
  if (!result.ok) return { text, message: result.message };

  const plan = await buildPlan(result.proposal, places, trip, geocode);
  if (plan.places.length === 0 && plan.transfers.length === 0) {
    return {
      text,
      message: plan.questions.length
        ? `Ich konnte nichts eintragen. ${plan.questions.join(" ")}`
        : "Ich habe im Text keine Orte oder Verschiebungen gefunden.",
    };
  }
  return { text, plan };
}

/** Schritt 2: die bestätigten Einträge speichern. Der Plan wird erneut geprüft, nie blind übernommen. */
export async function applyPlan(
  tripId: string,
  _prev: AiState,
  formData: FormData,
): Promise<AiState> {
  const text = String(formData.get("text") ?? "");
  if (!uuid.safeParse(tripId).success) return { text, message: "Ungültige Reise." };

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("plan") ?? ""));
  } catch {
    return { text, message: "Der Vorschlag ist nicht mehr gültig. Bitte erstelle ihn neu." };
  }
  const parsed = planSchema.safeParse(raw);
  if (!parsed.success) return { text, message: "Der Vorschlag ist nicht mehr gültig. Bitte erstelle ihn neu." };
  const plan = parsed.data;

  const chosenPlaces = new Set(formData.getAll("place").map(String));
  const chosenTransfers = new Set(formData.getAll("transfer").map(String));
  const places = plan.places.filter((p) => chosenPlaces.has(p.ref));
  const transfers = plan.transfers.filter((_, i) => chosenTransfers.has(String(i)));
  if (places.length === 0 && transfers.length === 0) {
    return { text, plan, message: "Es ist nichts ausgewählt." };
  }

  const supabase = await createClient();
  const { data: trip } = await supabase.from("trips").select("id").eq("id", tripId).maybeSingle();
  if (!trip) return { text, plan, message: "Reise nicht gefunden." };

  const { data: existing } = await supabase.from("destinations").select("id, sort_order").eq("trip_id", tripId);
  const knownIds = new Set((existing ?? []).map((d) => d.id as string));
  let order = Math.max(-1, ...(existing ?? []).map((d) => Number(d.sort_order))) + 1;

  const createdPlaces: string[] = [];
  const createdTransfers: string[] = [];
  const refToId = new Map<string, string>();
  const rollback = async () => {
    if (createdTransfers.length) await supabase.from("transfers").delete().in("id", createdTransfers).eq("trip_id", tripId);
    if (createdPlaces.length) await supabase.from("destinations").delete().in("id", createdPlaces).eq("trip_id", tripId);
  };
  const fail = async (what: string, error: { code?: string; message?: string } | null) => {
    console.error(`applyPlan ${what} failed:`, error?.code, error?.message);
    await rollback();
    return { text, plan, message: "Das Speichern ist fehlgeschlagen. Es wurde nichts übernommen." } satisfies AiState;
  };

  for (const p of places) {
    const { data, error } = await supabase
      .from("destinations")
      .insert({
        trip_id: tripId,
        sort_order: order++,
        name: p.name,
        kind: p.kind,
        arrival_date: p.arrival_date,
        departure_date: p.departure_date,
        timezone: p.timezone,
        lat: p.lat,
        lng: p.lng,
        place_label: p.lat === null ? null : p.place_label,
        addr_street: p.addr_street,
        addr_house_number: p.addr_house_number,
        addr_postcode: p.addr_postcode,
        addr_city: p.addr_city,
        addr_region: p.addr_region,
        addr_country: p.addr_country,
        lodging_name: p.lodging_name,
        lodging_checkin: p.lodging_checkin,
        description: p.description,
        notes: p.notes,
        source: "ai",
        source_ref: "chat",
        reviewed: true,
      })
      .select("id")
      .single();
    if (error || !data) return fail("place", error);
    createdPlaces.push(data.id as string);
    refToId.set(p.ref, data.id as string);
  }

  /** Bekannter Ort → Verweis, sonst freier Ort mit Namen und Koordinaten. */
  const side = (e: PlanEndpoint) => {
    const id = e.existing_id && knownIds.has(e.existing_id) ? e.existing_id : e.ref ? refToId.get(e.ref) : undefined;
    if (id) return { id, place: null, lat: null, lng: null };
    const label = (e.place ?? e.label).trim();
    return {
      id: null,
      place: label || null,
      lat: label ? e.lat : null,
      lng: label ? e.lng : null,
    };
  };

  const routable: { id: string; row: Parameters<typeof storeRoute>[3] }[] = [];
  for (const t of transfers) {
    const from = side(t.from);
    const to = side(t.to);
    const row = {
      trip_id: tripId,
      kind: t.kind,
      from_destination_id: from.id,
      to_destination_id: to.id,
      from_place: from.place,
      to_place: to.place,
      from_lat: from.lat,
      from_lng: from.lng,
      to_lat: to.lat,
      to_lng: to.lng,
      depart_at: t.depart_local && t.depart_tz ? localToUtcIso(t.depart_local, t.depart_tz) : null,
      depart_tz: t.depart_local ? t.depart_tz : null,
      arrive_at: t.arrive_local && t.arrive_tz ? localToUtcIso(t.arrive_local, t.arrive_tz) : null,
      arrive_tz: t.arrive_local ? t.arrive_tz : null,
      duration_min: t.duration_min,
      distance_km: t.distance_km,
      carrier: t.carrier,
      flight_number: t.flight_number,
      booking_ref: t.booking_ref,
      source: "ai",
      source_ref: "chat",
      reviewed: true,
    };
    const { data, error } = await supabase.from("transfers").insert(row).select("id").single();
    if (error || !data) return fail("transfer", error);
    createdTransfers.push(data.id as string);
    routable.push({
      id: data.id as string,
      row: {
        kind: t.kind,
        from_destination_id: from.id,
        to_destination_id: to.id,
        from_lat: from.lat,
        from_lng: from.lng,
        to_lat: to.lat,
        to_lng: to.lng,
      },
    });
  }

  // Strassenrouten für Autofahrten: best effort, ein Fehler des Dienstes ändert nichts am Speichern.
  for (const r of routable) {
    if (r.row.kind === "drive") await storeRoute(supabase, tripId, r.id, r.row);
  }

  revalidatePath("/", "layout");
  redirect(`/trips/${tripId}`);
}
