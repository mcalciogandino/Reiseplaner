"use server";

import { z } from "zod";
import { reviewTrip, type TripReview } from "@/lib/ai/claude";
import { loadSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { TRIP_COLUMNS, type Trip } from "@/lib/trips";

export type ReviewState = { message?: string; review?: TripReview } | null;

/** KI prüft den Plan auf Lücken und knappe Zeiten. Liest nur, speichert nichts. */
export async function checkTrip(tripId: string): Promise<ReviewState> {
  if (!z.uuid().safeParse(tripId).success) return { message: "Ungültige Reise." };
  const supabase = await createClient();
  const { data: trip } = await supabase.from("trips").select(TRIP_COLUMNS).eq("id", tripId).maybeSingle<Trip>();
  if (!trip) return { message: "Reise nicht gefunden." };
  const [{ data: stops }, { data: legs }] = await Promise.all([
    supabase
      .from("destinations")
      .select("name, kind, arrival_date, departure_date, lodging_name, timezone")
      .eq("trip_id", tripId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("transfers")
      .select("kind, from_place, to_place, depart_at, arrive_at, duration_min, distance_km, from_destination_id, to_destination_id")
      .eq("trip_id", tripId)
      .eq("is_option", false)
      .order("depart_at", { ascending: true, nullsFirst: false }),
  ]);
  if (!stops?.length && !legs?.length) return { message: "Es gibt noch nichts zu prüfen: Lege zuerst Orte oder Verschiebungen an." };

  const lines = [
    `Reise: ${trip.name}, ${trip.start_date} bis ${trip.end_date}.`,
    "Orte (in Reihenfolge):",
    ...(stops ?? []).map(
      (p) =>
        `- ${p.name} [${p.kind}] ${p.arrival_date ?? "?"} bis ${p.departure_date ?? "?"}${p.lodging_name ? `, Unterkunft ${p.lodging_name}` : ", keine Unterkunft"}${p.timezone ? `, ${p.timezone}` : ""}`,
    ),
    "Verschiebungen:",
    ...(legs ?? []).map(
      (t) =>
        `- ${t.kind}: ${t.from_place ?? "Ort der Reise"} → ${t.to_place ?? "Ort der Reise"}, Abfahrt ${t.depart_at ?? "?"}, Ankunft ${t.arrive_at ?? "?"}, ${t.duration_min ?? "?"} min, ${t.distance_km ?? "?"} km`,
    ),
  ];
  const settings = await loadSettings(supabase);
  const res = await reviewTrip(lines.join("\n"), { apiKey: settings.anthropicKey, model: settings.model });
  return res.ok ? { review: res.data } : { message: res.message };
}
