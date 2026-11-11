"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { ok: boolean; message: string } | null;

const emailSchema = z.string().trim().email("Bitte eine gültige E-Mail-Adresse eingeben.");

export async function sendMagicLink(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: {
      // Der gemeinsame Account wird in Supabase von Hand angelegt.
      shouldCreateUser: false,
      emailRedirectTo: `${proto}://${host}/auth/callback`,
    },
  });

  if (error) {
    return {
      ok: false,
      message:
        "Der Link konnte nicht gesendet werden. Ist diese Adresse als gemeinsamer Account angelegt?",
    };
  }
  return { ok: true, message: "Link gesendet. Bitte das Postfach prüfen." };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}
