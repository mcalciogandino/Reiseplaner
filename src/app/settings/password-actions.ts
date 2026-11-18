"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type PasswordState = { ok: boolean; message: string } | null;

const schema = z
  .object({
    password: z.string().min(8, "Das Passwort braucht mindestens 8 Zeichen.").max(72, "Das Passwort ist zu lang (höchstens 72 Zeichen)."),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { message: "Die beiden Passwörter stimmen nicht überein.", path: ["confirm"] });

/** Setzt ein neues Passwort für den angemeldeten Account. */
export async function changePassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const parsed = schema.safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return { ok: false, message: "Bitte melde dich neu an." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    console.error("changePassword failed:", error.status, error.code);
    return { ok: false, message: "Das Passwort konnte nicht geändert werden. Melde dich neu an und versuche es noch einmal." };
  }
  return { ok: true, message: "Passwort geändert." };
}
