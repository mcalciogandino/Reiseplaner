import type { createClient } from "./supabase/server";
import { suggestVehicle } from "./vehicles";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Ordnet neu angelegten Autofahrten (z. B. durch die KI) das passende Fahrzeug der Reise zu:
 * das zur Abfahrt verfügbare, sonst das einzige bzw. zuletzt übernommene. Best effort: Ein Fehler
 * ändert nichts am Speichern, die Fahrt bleibt dann ohne Fahrzeug und lässt sich von Hand zuordnen.
 */
export async function assignVehicles(supabase: Supabase, tripId: string, transferIds: string[]): Promise<void> {
  if (transferIds.length === 0) return;
  const [{ data: cars }, { data: drives }] = await Promise.all([
    supabase.from("vehicles").select("id, pickup_at, return_at").eq("trip_id", tripId),
    supabase
      .from("transfers")
      .select("id, depart_at")
      .eq("trip_id", tripId)
      .eq("kind", "drive")
      .eq("is_option", false)
      .is("vehicle_id", null)
      .in("id", transferIds),
  ]);
  const vehicles = (cars ?? []) as { id: string; pickup_at: string | null; return_at: string | null }[];
  if (vehicles.length === 0) return;
  for (const d of (drives ?? []) as { id: string; depart_at: string | null }[]) {
    const car = suggestVehicle(vehicles, d.depart_at);
    if (!car) continue;
    const { error } = await supabase.from("transfers").update({ vehicle_id: car.id }).eq("id", d.id).eq("trip_id", tripId);
    if (error) console.error("assignVehicles failed:", error.code);
  }
}
