"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
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
    // Nur serverseitig im Log, nie an den Browser.
    console.error("Magic link failed:", error.status, error.code, error.message);
    if (error.code === "over_email_send_rate_limit") {
      return {
        ok: false,
        message:
          "Zu viele E-Mails in kurzer Zeit. Bitte etwas warten oder mit Passwort anmelden.",
      };
    }
    return {
      ok: false,
      message:
        "Der Link konnte nicht gesendet werden. Ist diese Adresse als gemeinsamer Account angelegt?",
    };
  }
  return { ok: true, message: "Link gesendet. Bitte das Postfach prüfen." };
}

const passwordSchema = z.object({
  email: z.string().trim().email("Bitte eine gültige E-Mail-Adresse eingeben."),
  password: z.string().min(1, "Bitte das Passwort eingeben."),
});

export async function signInWithPassword(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = passwordSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    console.error("Password login failed:", error.status, error.code);
    return { ok: false, message: "E-Mail-Adresse oder Passwort stimmt nicht." };
  }
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}
