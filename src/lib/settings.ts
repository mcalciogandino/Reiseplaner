import type { createClient } from "./supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const MODELS = [
  { value: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (empfohlen, ausgewogen)" },
  { value: "claude-haiku-5-5", label: "Claude Haiku 5.5 (am günstigsten, einfache Texte)" },
  { value: "claude-opus-5-5", label: "Claude Opus 5.5 (am gründlichsten, teurer)" },
] as const;
export const DEFAULT_MODEL = MODELS[0].value;

export type Settings = {
  anthropicKey: string | null;
  orsKey: string | null;
  model: string;
};

const clean = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Schlüssel aus den Einstellungen; ohne Eintrag gilt die Umgebungsvariable (z. B. auf dem Server). */
export function resolveSettings(
  row: { anthropic_api_key?: unknown; ors_api_key?: unknown; ai_model?: unknown } | null,
  env: Record<string, string | undefined> = process.env,
): Settings {
  const model = clean(row?.ai_model) ?? clean(env.AI_MODEL) ?? DEFAULT_MODEL;
  return {
    anthropicKey: clean(row?.anthropic_api_key) ?? clean(env.ANTHROPIC_API_KEY),
    orsKey: clean(row?.ors_api_key) ?? clean(env.ORS_API_KEY),
    model,
  };
}

/** Lädt die Einstellungen der angemeldeten Person; ein fehlender Eintrag oder fehlende Tabelle ist kein Fehler. */
export async function loadSettings(supabase: Supabase): Promise<Settings> {
  const { data, error } = await supabase
    .from("user_settings")
    .select("anthropic_api_key, ors_api_key, ai_model")
    .maybeSingle();
  if (error) console.error("loadSettings failed:", error.code);
  return resolveSettings(error ? null : data);
}

/** Zeigt von einem Schlüssel nur Anfang und Ende, z. B. «sk-ant-…x9Qz». */
export function maskKey(key: string | null): string | null {
  if (!key) return null;
  if (key.length <= 12) return "…" + key.slice(-2);
  return `${key.slice(0, 7)}…${key.slice(-4)}`;
}

/** Grobe Formatprüfung, damit offensichtliche Tippfehler nicht gespeichert werden. */
export function validateAnthropicKey(key: string): string | null {
  if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key)) {
    return "Das sieht nicht nach einem Claude-API-Schlüssel aus (er beginnt mit «sk-ant-»).";
  }
  return null;
}
export function validateOrsKey(key: string): string | null {
  if (key.length < 20 || /\s/.test(key)) return "Der Routen-Schlüssel ist ungültig (zu kurz oder mit Leerzeichen).";
  return null;
}
