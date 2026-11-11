"use server";

import { z } from "zod";
import { describePlace } from "@/lib/ai/claude";
import { PLACE_KIND_LABELS, type PlaceKind } from "@/lib/destinations";
import { loadSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";

export type DescribeResult = { ok: true; text: string } | { ok: false; message: string };

const input = z.object({
  tripId: z.uuid(),
  name: z.string().trim().min(1, "Bitte zuerst den Namen des Ortes eingeben.").max(100),
  kind: z.string().max(40),
  where: z.string().max(300),
  dates: z.string().max(60),
});

/** Schreibt einen Beschreibungsvorschlag für den Ort; gespeichert wird erst mit dem Formular. */
export async function suggestDescription(raw: z.input<typeof input>): Promise<DescribeResult> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return { ok: false, message: "Bitte melde dich erneut an." };
  const { data: trip } = await supabase.from("trips").select("name").eq("id", parsed.data.tripId).maybeSingle();
  if (!trip) return { ok: false, message: "Reise nicht gefunden." };

  const settings = await loadSettings(supabase);
  return describePlace(
    {
      name: parsed.data.name,
      kind: PLACE_KIND_LABELS[parsed.data.kind as PlaceKind] ?? parsed.data.kind,
      where: parsed.data.where,
      trip: trip.name as string,
      dates: parsed.data.dates,
    },
    { apiKey: settings.anthropicKey, model: settings.model },
  );
}
