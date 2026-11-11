import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Reisezeitraum für die Datumsfelder; unbekannte oder fremde Reise → 404. */
export async function getTripRange(tripId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("trips")
    .select("start_date, end_date")
    .eq("id", tripId)
    .maybeSingle<{ start_date: string; end_date: string }>();
  if (!data) notFound();
  return data;
}
