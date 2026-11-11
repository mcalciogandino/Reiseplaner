"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type TripFormState = {
  message: string;
  values: Record<string, string>;
} | null;

const tripSchema = z
  .object({
    name: z.string().trim().min(1, "Bitte einen Namen eingeben.").max(100),
    origin: z.string().trim().min(1, "Bitte den Startort eingeben.").max(100),
    destination: z.string().trim().min(1, "Bitte den Zielort eingeben.").max(100),
    start_date: z.iso.date("Bitte ein gültiges Startdatum wählen."),
    end_date: z.iso.date("Bitte ein gültiges Enddatum wählen."),
  })
  .refine((d) => d.end_date >= d.start_date, {
    message: "Das Ende darf nicht vor dem Start liegen.",
    path: ["end_date"],
  });

export async function createTrip(
  _prev: TripFormState,
  formData: FormData,
): Promise<TripFormState> {
  const values = Object.fromEntries(
    ["name", "origin", "destination", "start_date", "end_date"].map((k) => [
      k,
      String(formData.get(k) ?? ""),
    ]),
  );

  const parsed = tripSchema.safeParse(values);
  if (!parsed.success) {
    return { message: parsed.error.issues[0].message, values };
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) redirect("/login");

  const { data, error } = await supabase
    .from("trips")
    .insert({ ...parsed.data, owner_id: userId })
    .select("id")
    .single();

  if (error || !data) {
    console.error("createTrip failed:", error?.code, error?.message);
    return { message: "Die Reise konnte nicht gespeichert werden.", values };
  }
  redirect(`/trips/${data.id}`);
}
