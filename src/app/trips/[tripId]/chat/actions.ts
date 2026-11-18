"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { buildPlan } from "@/lib/ai/build-plan";
import { chatReply, extrasSchema, hasExtras, type ChatTurn, type Extras } from "@/lib/ai/chat";
import { PLACE_PATCH_KEYS, TRANSFER_PATCH_KEYS, resolveChanges, type ChangePreview } from "@/lib/ai/changes";
import { geocodeFirst } from "@/lib/ai/geocode";
import { planSchema, type Plan } from "@/lib/ai/plan";
import { loadTripContext } from "@/lib/ai/trip-context";
import { loadSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { DESTINATION_COLUMNS, type Destination } from "@/lib/destinations";
import { storeRoute } from "@/lib/route-store";
import { TRANSFER_COLUMNS, type Transfer } from "@/lib/transfers";
import { savePlan } from "../ai/actions";

export type ChatState = { message?: string; done?: boolean } | null;

const uuid = z.uuid();
const MAX_TEXT = 4000;
const HISTORY = 30;

/** Was in `chat_messages.proposal` steht: der geprüfte Plan und sein Stand. */
export type StoredProposal = { plan: Plan; extras?: Extras | null; changes?: ChangePreview[]; applied?: boolean; dismissed?: boolean };

function proposalNote(p: StoredProposal | null): string {
  if (!p) return "";
  const x = p.extras;
  const n = `${p.plan.places.length} Orte, ${p.plan.transfers.length} Verschiebungen, ${p.plan.vehicles.length} Fahrzeuge${x ? `, ${x.checklist.length} Aufgaben, ${x.bucket.length} Ideen, ${x.budget.length} Budgetposten` : ""}`;
  const ch = p.changes?.length ? `, ${p.changes.length} Änderungen/Löschungen` : "";
  return `\n\n[Vorschlag mit ${n}${ch} — ${p.applied ? "von der Person eingefügt" : p.dismissed ? "verworfen" : "noch nicht eingefügt"}]`;
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
  const extras = result.extras;
  let changes: ChangePreview[] = [];
  if (result.changes.length) {
    const [{ data: dests }, { data: legs }] = await Promise.all([
      supabase.from("destinations").select(DESTINATION_COLUMNS).eq("trip_id", tripId).returns<Destination[]>(),
      supabase.from("transfers").select(TRANSFER_COLUMNS).eq("trip_id", tripId).eq("is_option", false).returns<Transfer[]>(),
    ]);
    changes = resolveChanges(result.changes, dests ?? [], legs ?? []);
  }
  if (result.proposal || extras || changes.length) {
    const plan = result.proposal
      ? await buildPlan(result.proposal, loaded.places, loaded.trip, geocodeFirst)
      : await buildPlan({ summary: "", places: [], transfers: [], vehicles: [], questions: [] }, loaded.places, loaded.trip, geocodeFirst);
    if (plan.places.length || plan.transfers.length || plan.vehicles.length || hasExtras(extras) || changes.length) stored = { plan, extras, changes };
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

  const picks = (k: string) => new Set(formData.getAll(k).map(String));
  const planPicked =
    formData.getAll("place").length + formData.getAll("transfer").length + formData.getAll("vehicle").length > 0 ||
    [...formData.entries()].some(([k, v]) => k.startsWith("grp_") && v !== "");
  const extras = extrasSchema.safeParse(stored.extras ?? {});
  const x = extras.success ? extras.data : null;
  const chosenChecklist = x ? x.checklist.filter((_, i) => picks("x_checklist").has(String(i))) : [];
  const chosenBucket = x ? x.bucket.filter((_, i) => picks("x_bucket").has(String(i))) : [];
  const chosenBudget = x ? x.budget.filter((_, i) => picks("x_budget").has(String(i))) : [];
  const extrasPicked = chosenChecklist.length + chosenBucket.length + chosenBudget.length > 0;
  const chosenChanges = (stored.changes ?? []).filter((_, i) => picks("x_change").has(String(i)));
  if (!planPicked && !extrasPicked && chosenChanges.length === 0) return { message: "Es ist nichts ausgewählt." };

  // Änderungen und Löschungen zuerst: wird ein Eintrag ersetzt, ist der alte weg, bevor der neue kommt.
  for (const ch of chosenChanges) {
    const failedChange = await applyChange(supabase, tripId, ch);
    if (failedChange) return { message: failedChange };
  }

  if (planPicked) {
    formData.set("plan", JSON.stringify(stored.plan));
    const failed = await savePlan(tripId, formData);
    if (failed) return { message: failed.message ?? "Das Speichern ist fehlgeschlagen." };
  }
  if (extrasPicked) {
    const inserts = [
      chosenChecklist.length
        ? supabase.from("checklist_items").insert(
            chosenChecklist.map((c) => ({ trip_id: tripId, list: c.list, title: c.title, due_date: c.due_date ?? null, source: "ai", reviewed: true })),
          )
        : null,
      chosenBucket.length
        ? supabase.from("activities").insert(
            chosenBucket.map((b) => ({
              trip_id: tripId,
              title: b.title,
              description: b.description ?? null,
              priority: b.priority,
              estimated_cost: b.estimated_cost ?? null,
              currency: b.currency ?? "CAD",
              source: "ai",
              reviewed: true,
            })),
          )
        : null,
      chosenBudget.length
        ? supabase.from("budget_entries").insert(chosenBudget.map((b) => ({ trip_id: tripId, ...b, source: "ai", reviewed: true })))
        : null,
    ];
    const results = await Promise.all(inserts);
    const bad = results.find((r) => r?.error);
    if (bad?.error) {
      console.error("applyChatProposal extras failed:", bad.error.code);
      return { message: "Ein Teil konnte nicht gespeichert werden. Prüfe die Seiten und versuche es noch einmal." };
    }
  }

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

type Supabase = Awaited<ReturnType<typeof createClient>>;

const pick = (patch: Record<string, unknown>, keys: readonly string[]) => Object.fromEntries(Object.entries(patch).filter(([k]) => keys.includes(k)));

/** Wendet eine geprüfte Änderung an; Spalten werden erneut auf die erlaubten beschränkt, alle Zugriffe auf die Reise begrenzt. */
async function applyChange(supabase: Supabase, tripId: string, ch: ChangePreview): Promise<string | null> {
  const fail = (e: { code?: string } | null) => {
    console.error("applyChange failed:", ch.op, e?.code);
    return "Eine Änderung konnte nicht gespeichert werden. Es wurde nicht alles übernommen; prüfe die Zeitleiste.";
  };
  if (!uuid.safeParse(ch.id).success) return null;
  if (ch.op === "delete_place") {
    const { error } = await supabase.from("destinations").delete().eq("id", ch.id).eq("trip_id", tripId);
    return error ? fail(error) : null;
  }
  if (ch.op === "delete_transfer") {
    const { data } = await supabase.from("transfers").select("option_group").eq("id", ch.id).eq("trip_id", tripId).maybeSingle();
    const group = data?.option_group as string | null | undefined;
    if (group) await supabase.from("transfers").delete().eq("option_group", group).eq("is_option", true).eq("trip_id", tripId);
    const { error } = await supabase.from("transfers").delete().eq("id", ch.id).eq("trip_id", tripId);
    return error ? fail(error) : null;
  }
  if (!ch.patch) return null;
  if (ch.op === "update_place") {
    const patch = pick(ch.patch, PLACE_PATCH_KEYS);
    if (!Object.keys(patch).length) return null;
    const { error } = await supabase.from("destinations").update(patch).eq("id", ch.id).eq("trip_id", tripId);
    return error ? fail(error) : null;
  }
  const patch = pick(ch.patch, TRANSFER_PATCH_KEYS);
  if (!Object.keys(patch).length) return null;
  const { error } = await supabase.from("transfers").update(patch).eq("id", ch.id).eq("trip_id", tripId);
  if (error) return fail(error);
  if ("from_destination_id" in patch || "to_destination_id" in patch || "kind" in patch) {
    const { data: row } = await supabase.from("transfers").select(TRANSFER_COLUMNS).eq("id", ch.id).eq("trip_id", tripId).maybeSingle<Transfer>();
    if (row?.kind === "drive") await storeRoute(supabase, tripId, ch.id, row); // best effort
  }
  return null;
}
