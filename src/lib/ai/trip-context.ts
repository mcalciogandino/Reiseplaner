import type { SupabaseClient } from "@supabase/supabase-js";
import { KIND_LABELS, type TransferKind } from "../transfers";
import { TRIP_COLUMNS, type Trip } from "../trips";
import { VEHICLE_COLUMNS, vehicleLine, type Vehicle } from "../vehicles";
import type { KnownPlace } from "./build-plan";
import { tripContext } from "./prompt";

export type LoadedContext = {
  trip: Trip;
  places: (KnownPlace & { arrival_date: string | null; departure_date: string | null })[];
  counts: { places: number; transfers: number; vehicles: number };
  context: string;
};

/** Aktueller Stand der Reise als Text für die KI (Orte mit IDs, Verschiebungen, Fahrzeuge). */
export async function loadTripContext(supabase: SupabaseClient, tripId: string): Promise<LoadedContext | null> {
  const { data: trip } = await supabase.from("trips").select(TRIP_COLUMNS).eq("id", tripId).maybeSingle<Trip>();
  if (!trip) return null;
  const [{ data: stops }, { data: legs }, { data: cars }] = await Promise.all([
    supabase
      .from("destinations")
      .select("id, name, timezone, lat, lng, arrival_date, departure_date")
      .eq("trip_id", tripId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("transfers")
      .select("id, kind, from_destination_id, to_destination_id, from_place, to_place, depart_at")
      .eq("trip_id", tripId)
      .eq("is_option", false),
    supabase.from("vehicles").select(VEHICLE_COLUMNS).eq("trip_id", tripId).returns<Vehicle[]>(),
  ]);
  const places = (stops ?? []) as LoadedContext["places"];
  const name = new Map(places.map((p) => [p.id, p.name]));
  const context = tripContext({
    vehicles: (cars ?? []).map(vehicleLine),
    name: trip.name,
    start_date: trip.start_date,
    end_date: trip.end_date,
    places,
    transfers: (legs ?? []).map((t) => ({
      id: t.id as string,
      kind: KIND_LABELS[t.kind as TransferKind] ?? t.kind,
      from: (t.from_destination_id && name.get(t.from_destination_id)) || t.from_place || "",
      to: (t.to_destination_id && name.get(t.to_destination_id)) || t.to_place || "",
      depart: t.depart_at,
    })),
  });
  return { trip, places, counts: { places: places.length, transfers: legs?.length ?? 0, vehicles: cars?.length ?? 0 }, context };
}
