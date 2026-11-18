"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { buildPlan } from "@/lib/ai/build-plan";
import { chatReply, type ChatTurn } from "@/lib/ai/chat";
import { geocodeFirst } from "@/lib/ai/geocode";
import { planSchema, type Plan } from "@/lib/ai/plan";
import { loadTripContext } from "@/lib/ai/trip-context";
import { loadSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { savePlan } from "../ai/actions";

export type ChatState = { message?: string; done?: boolean } | null;

const uuid = z.uuid();
const MAX_TEXT = 4000;
const HISTORY = 30;

/** Was in `chat_messages.proposal` steht: der geprüfte Plan und sein Stand. */
export type StoredProposal = { plan: Plan; applied?: boolean; dismissed?: boolean };

function proposalNote(p: StoredProposal | null): string {
  if (!p) return "";
  const n = `${p.plan.places.length} Orte, ${p.plan.transfers.length} Verschiebungen, ${p.plan.vehicles.length} Fahrzeuge`;
  return `\n\n[Vorschlag mit ${n} — ${p.applied ? "von der Person eingefügt" : p.dismissed ? "verworfen" : "noch nicht eingefügt"}]`;
}

/**
 * Nimmt eine Nachricht an, lässt die KI antworten und speichert beide. Ohne Text wird die Antwort auf
 * die letzte unbeantwortete Nachricht erneut angefordert.
 */
export async function sendChat(tripId: string, _prev: ChatState, formData: FormData): Promise<ChatState> {
  const text = String(formData.get("text") ?? "").trim();
  const web = formData.get("web") === "on";
  if (!uuid.safeParse(tripId).success) return { message: "Ungültige Reise." };
  if (text.length > MAX_TEXT) return { message: `Die Nachricht ist zu lang (höchstens ${MAX_TEXT} Zeichen).` };

  const supabase = await createClient();
  const loaded = await loadTripContext(supabase, tripId);
  if (!loaded) return { message: "Reise nicht gefunden." };

  if (text) {
    const { error } = await supabase.from("chat_messages").insert({ trip_id: tripId, role: "user", content: text });
    if (error) {
      console.error("sendChat insert failed:", error.code);
      return { message: "Die Nachricht konnte nicht gespeichert werden." };
    }
  }

  const { data: rows } = await supabase
    .from("chat_messages")
    .select("role, content, proposal")
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false })
    .limit(HISTORY);
  const history: ChatTurn[] = (rows ?? [])
    .reverse()
    .map((r) => ({ role: r.role as "user" | "assistant", content: r.content + proposalNote(r.proposal as StoredProposal | null) }));
  if (history.at(-1)?.role !== "user") return { message: "Schreibe zuerst eine Nachricht." };

  const settings = await loadSettings(supabase);
  const result = await chatReply(history, loaded.context, { apiKey: settings.anthropicKey, model: settings.model }, { web });
  if (!result.ok) return { message: result.message };

  let stored: StoredProposal | null = null;
  let content = result.message;
  if (result.proposal) {
    const plan = await buildPlan(result.proposal, loaded.places, loaded.trip, geocodeFirst);
    if (plan.places.length || plan.transfers.length || plan.vehicles.length) stored = { plan };
    else content += "\n\n(Aus dem Vorschlag konnte nichts Eintragbares gebaut werden.)";
  }
  const { error } = await supabase
    .from("chat_messages")
    .insert({ trip_id: tripId, role: "assistant", content, proposal: stored });
  if (error) {
    console.error("sendChat reply insert failed:", error.code);
    return { message: "Die Antwort konnte nicht gespeichert werden." };
  }
  revalidatePath(`/trips/${tripId}/chat`);
  return { done: true };
}

async function loadProposal(tripId: string, messageId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("chat_messages")
    .select("id, role, proposal")
    .eq("id", messageId)
    .eq("trip_id", tripId)
    .maybeSingle();
  const raw = data?.proposal as StoredProposal | null | undefined;
  const plan = planSchema.safeParse(raw?.plan);
  return { supabase, stored: raw && plan.success ? { ...raw, plan: plan.data } : null };
}

/** Fügt die gewählten Einträge des Vorschlags in die Reise ein. Der Plan kommt aus der Datenbank, nicht aus dem Formular. */
export async function applyChatProposal(
  tripId: string,
  messageId: string,
  _prev: ChatState,
  formData: FormData,
): Promise<ChatState> {
  if (!uuid.safeParse(tripId).success || !uuid.safeParse(messageId).success) return { message: "Ungültiger Vorschlag." };
  const { supabase, stored } = await loadProposal(tripId, messageId);
  if (!stored) return { message: "Der Vorschlag ist nicht mehr gültig." };
  if (stored.applied) return { message: "Dieser Vorschlag wurde schon eingefügt." };

  formData.set("plan", JSON.stringify(stored.plan));
  const failed = await savePlan(tripId, formData);
  if (failed) return { message: failed.message ?? "Das Speichern ist fehlgeschlagen." };

  await supabase.from("chat_messages").update({ proposal: { ...stored, applied: true } }).eq("id", messageId).eq("trip_id", tripId);
  revalidatePath("/", "layout");
  return { done: true };
}

export async function dismissChatProposal(tripId: string, messageId: string) {
  if (!uuid.safeParse(tripId).success || !uuid.safeParse(messageId).success) return;
  const { supabase, stored } = await loadProposal(tripId, messageId);
  if (!stored || stored.applied) return;
  await supabase.from("chat_messages").update({ proposal: { ...stored, dismissed: true } }).eq("id", messageId).eq("trip_id", tripId);
  revalidatePath(`/trips/${tripId}/chat`);
}

/** Beginnt das Gespräch dieser Variante von vorn (die Reise selbst bleibt unverändert). */
export async function clearChat(tripId: string) {
  if (!uuid.safeParse(tripId).success) return;
  const supabase = await createClient();
  await supabase.from("chat_messages").delete().eq("trip_id", tripId);
  revalidatePath(`/trips/${tripId}/chat`);
}
