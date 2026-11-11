"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import {
  loadSettings,
  MODELS,
  validateAnthropicKey,
  validateOrsKey,
} from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";

export type SettingsState = { ok: boolean; message: string } | null;

const MODEL_VALUES: string[] = MODELS.map((m) => m.value);

/** Speichert nur ausgefüllte Felder; ein leeres Schlüsselfeld lässt den gespeicherten Wert unverändert. */
export async function saveSettings(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const owner = claims?.claims?.sub;
  if (!owner) return { ok: false, message: "Bitte melde dich erneut an." };

  const row: Record<string, string | null> = { owner_id: owner };
  const anthropic = String(formData.get("anthropic_api_key") ?? "").trim();
  const ors = String(formData.get("ors_api_key") ?? "").trim();
  const model = String(formData.get("ai_model") ?? "").trim();

  if (anthropic) {
    const err = validateAnthropicKey(anthropic);
    if (err) return { ok: false, message: err };
    row.anthropic_api_key = anthropic;
  }
  if (ors) {
    const err = validateOrsKey(ors);
    if (err) return { ok: false, message: err };
    row.ors_api_key = ors;
  }
  if (model) {
    if (!MODEL_VALUES.includes(model)) return { ok: false, message: "Unbekanntes Modell." };
    row.ai_model = model;
  }
  if (formData.get("remove_anthropic") === "1") row.anthropic_api_key = null;
  if (formData.get("remove_ors") === "1") row.ors_api_key = null;

  row.updated_at = new Date().toISOString();
  const { error } = await supabase.from("user_settings").upsert(row, { onConflict: "owner_id" });
  if (error) {
    console.error("saveSettings failed:", error.code);
    return {
      ok: false,
      message:
        error.code === "42P01" || error.code === "PGRST205"
          ? "Die Tabelle «user_settings» fehlt noch. Führe supabase/catch-up.sql im SQL Editor aus."
          : "Die Einstellungen konnten nicht gespeichert werden.",
    };
  }
  revalidatePath("/settings");
  return { ok: true, message: "Gespeichert." };
}

/** Schickt eine winzige Anfrage an Claude, um den gespeicherten Schlüssel zu prüfen. */
export async function testAnthropicKey(): Promise<SettingsState> {
  const supabase = await createClient();
  const { anthropicKey, model } = await loadSettings(supabase);
  if (!anthropicKey) return { ok: false, message: "Es ist noch kein Schlüssel hinterlegt." };
  try {
    const client = new Anthropic({ apiKey: anthropicKey, timeout: 20_000, maxRetries: 0 });
    await client.messages.create({ model, max_tokens: 8, messages: [{ role: "user", content: "Antworte mit: ok" }] });
    return { ok: true, message: "Der Schlüssel funktioniert." };
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 401) return { ok: false, message: "Der Schlüssel wurde abgelehnt (ungültig oder widerrufen)." };
    if (status === 403) return { ok: false, message: "Der Schlüssel hat keine Berechtigung." };
    if (status === 404) return { ok: false, message: "Das gewählte Modell ist für diesen Schlüssel nicht verfügbar." };
    if (status === 429) return { ok: false, message: "Zu viele Anfragen oder Guthaben aufgebraucht." };
    return { ok: false, message: "Claude ist nicht erreichbar. Versuche es später noch einmal." };
  }
}
