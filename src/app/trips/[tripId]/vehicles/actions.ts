"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export async function deleteVehicle(tripId: string, vehicleId: string) {
  if (!z.uuid().safeParse(tripId).success || !z.uuid().safeParse(vehicleId).success) return;
  const supabase = await createClient();
  await supabase.from("vehicles").delete().eq("id", vehicleId).eq("trip_id", tripId);
  revalidatePath(`/trips/${tripId}/vehicles`);
  revalidatePath(`/trips/${tripId}`);
}
