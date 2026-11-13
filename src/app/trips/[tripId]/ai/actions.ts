"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { searchPlaces } from "@/app/geocode/actions";
import { buildPlan, type GeoHit, type KnownPlace } from "@/lib/ai/build-plan";
import { proposeFromText, researchFromText } from "@/lib/ai/claude";
import { planSchema, type Plan, type PlanEndpoint } from "@/lib/ai/plan";
import { tripContext } from "@/lib/ai/prompt";
import { storeRoute } from "@/lib/route-store";
import { loadSettings } from "@/lib/settings";
import { VEHICLE_COLUMNS, vehicleLine, type Vehicle } from "@/lib/vehicles";
import { createClient } from "@/lib/supabase/server";
import { KIND_LABELS, localToUtcIso, type TransferKind } from "@/lib/transfers";
import { TRIP_COLUMNS, type Trip } from "@/lib/trips";

export type AiState = { text: string; message?: string; plan?: Plan } | null;

const uuid = z.uuid();
const MAX_TEXT = 8000;

/** Quellen der Recherche an die Notizen hängen, damit man sie später wiederfindet. */
function withSources(notes: string | null, sources: string[]): string | null {
  if (!sources.length) return notes;
  const block = `Quellen:\n${sources.join("\n")}`;
  return (notes ? `${notes}\n\n${block}` : block).slice(0, 2000);
}

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

  const [{ data: stops }, { data: legs }, { data: cars }] = await Promise.all([
    supabase
      .from("destinations")
      .select("id, name, timezone, lat, lng, arrival_date, departure_date")
      .eq("trip_id", tripId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("transfers")
      .select("kind, from_destination_id, to_destination_id, from_place, to_place, depart_at")
      .eq("trip_id", tripId)
      .eq("is_option", false),
    supabase.from("vehicles").select(VEHICLE_COLUMNS).eq("trip_id", tripId).returns<Vehicle[]>(),
  ]);
  const places = (stops ?? []) as (KnownPlace & { arrival_date: string | null; departure_date: string | null })[];
  const name = new Map(places.map((p) => [p.id, p.name]));

  const context = tripContext({
    vehicles: (cars ?? []).map(vehicleLine),
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

  const position = readPosition(formData);
  const hint =
    position === null
      ? ""
      : `\n\nHinweis: Die neuen Einträge werden ${
          position === 0
            ? "ganz am Anfang der Route"
            : position >= places.length
              ? `am Ende der Route, nach «${places.at(-1)?.name ?? ""}»`
              : `zwischen «${places[position - 1].name}» und «${places[position].name}»`
        } eingefügt. Passe Verschiebungen und Daten dazu an.`;
  const fullContext = context + hint;

  const settings = await loadSettings(supabase);
  const search = formData.get("mode") === "search";
  const creds = { apiKey: settings.anthropicKey, model: settings.model };
  const result = search
    ? await researchFromText(text, fullContext, creds)
    : await proposeFromText(text, fullContext, creds);
  if (!result.ok) return { text, message: result.message };

  const plan = await buildPlan(result.proposal, places, trip, geocode);
  if (search) plan.mode = "search";
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

/** Einfügestelle aus dem Formular (Anzahl Orte davor), sonst null. */
function readPosition(formData: FormData): number | null {
  const v = String(formData.get("pos") ?? "");
  return /^\d{1,3}$/.test(v) ? Number(v) : null;
}

/** Setzt die neuen Orte an die Stelle `position` der Routenreihenfolge und vergibt die Positionen lückenlos neu. */
async function placeAt(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tripId: string,
  newIds: string[],
  position: number,
) {
  const { data: rows } = await supabase
    .from("destinations")
    .select("id")
    .eq("trip_id", tripId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  const fresh = new Set(newIds);
  const ids = (rows ?? []).map((r) => r.id as string).filter((id) => !fresh.has(id));
  ids.splice(Math.min(Math.max(position, 0), ids.length), 0, ...newIds);
  const results = await Promise.all(
    ids.map((id, order) => supabase.from("destinations").update({ sort_order: order }).eq("id", id).eq("trip_id", tripId)),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) console.error("placeAt failed:", failed.error.code);
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
  // Einzelne Verbindungen: Häkchen «transfer»; Varianten: je Gruppe genau ein Eintrag «grp_<n>».
  const chosenTransfers = new Set(formData.getAll("transfer").map(String));
  for (const [key, value] of formData.entries()) if (key.startsWith("grp_") && value !== "") chosenTransfers.add(String(value));
  const chosenVehicles = new Set(formData.getAll("vehicle").map(String));
  const places = plan.places.filter((p) => chosenPlaces.has(p.ref));
  const transfers = plan.transfers.filter((_, i) => chosenTransfers.has(String(i)));
  const vehicles = plan.vehicles.filter((_, i) => chosenVehicles.has(String(i)));
  if (places.length === 0 && transfers.length === 0 && vehicles.length === 0) {
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
  const createdVehicles: string[] = [];
  const refToId = new Map<string, string>();
  const rollback = async () => {
    if (createdVehicles.length) await supabase.from("vehicles").delete().in("id", createdVehicles).eq("trip_id", tripId);
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
        lodging_checkout: p.lodging_checkout,
        lodging_price: p.lodging_price,
        lodging_currency: p.lodging_currency,
        lodging_booking_ref: p.lodging_booking_ref,
        description: p.description ?? p.reason,
        notes: withSources(p.notes, p.sources),
        source: "ai",
        source_ref: plan.mode === "search" ? (p.sources[0] ?? "recherche").slice(0, 500) : "chat",
        reviewed: true,
      })
      .select("id")
      .single();
    if (error || !data) return fail("place", error);
    createdPlaces.push(data.id as string);
    refToId.set(p.ref, data.id as string);
  }

  const position = readPosition(formData);
  if (position !== null && createdPlaces.length) await placeAt(supabase, tripId, createdPlaces, position);

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

  // Varianten: Gruppen mit mindestens zwei Mitgliedern; die nicht gewählten werden auf Wunsch als Alternativen gespeichert.
  const sizes = new Map<string, number>();
  for (const t of plan.transfers) if (t.group) sizes.set(t.group, (sizes.get(t.group) ?? 0) + 1);
  const isVariant = (g: string | null) => Boolean(g && (sizes.get(g) ?? 0) >= 2);
  const groupIds = new Map<string, string>();
  const groupId = (g: string) => groupIds.get(g) ?? (groupIds.set(g, crypto.randomUUID()), groupIds.get(g)!);
  const chosenGroups = new Set(transfers.filter((t) => isVariant(t.group)).map((t) => t.group as string));
  const keepOptions = formData.get("keep_options") === "1";
  const alternatives = keepOptions
    ? plan.transfers.filter((t, i) => isVariant(t.group) && chosenGroups.has(t.group as string) && !chosenTransfers.has(String(i)))
    : [];
  const queue = [
    ...transfers.map((t) => ({ t, opt: false })),
    ...alternatives.map((t) => ({ t, opt: true })),
  ];

  const routable: { id: string; row: Parameters<typeof storeRoute>[3] }[] = [];
  for (const { t, opt } of queue) {
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
      price: t.price,
      currency: t.currency,
      notes: t.notes,
      option_group: isVariant(t.group) ? groupId(t.group as string) : null,
      is_option: opt,
      source: "ai",
      source_ref: "chat",
      reviewed: true,
    };
    const { data, error } = await supabase.from("transfers").insert(row).select("id").single();
    if (error || !data) return fail("transfer", error);
    createdTransfers.push(data.id as string);
    if (opt) continue;
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

  for (const v of vehicles) {
    const { data, error } = await supabase
      .from("vehicles")
      .insert({
        trip_id: tripId,
        kind: v.kind,
        provider: v.provider,
        vehicle_name: v.vehicle_name,
        pickup_place: v.pickup_place,
        pickup_at: v.pickup_local && v.pickup_tz ? localToUtcIso(v.pickup_local, v.pickup_tz) : null,
        pickup_tz: v.pickup_local ? v.pickup_tz : null,
        return_place: v.return_place,
        return_at: v.return_local && v.return_tz ? localToUtcIso(v.return_local, v.return_tz) : null,
        return_tz: v.return_local ? v.return_tz : null,
        booking_ref: v.booking_ref,
        price: v.price,
        currency: v.currency,
        notes: v.notes,
        source: "ai",
        source_ref: "chat",
        reviewed: true,
      })
      .select("id")
      .single();
    if (error || !data) return fail("vehicle", error);
    createdVehicles.push(data.id as string);
  }

  // Strassenrouten für Autofahrten: best effort, ein Fehler des Dienstes ändert nichts am Speichern.
  for (const r of routable) {
    if (r.row.kind === "drive") await storeRoute(supabase, tripId, r.id, r.row);
  }

  revalidatePath("/", "layout");
  redirect(`/trips/${tripId}`);
}
