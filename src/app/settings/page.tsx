import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { DEFAULT_MODEL, maskKey, resolveSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "./settings-form";

export default function SettingsPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
      <Suspense fallback={<p>Lädt …</p>}>
        <Content />
      </Suspense>
    </main>
  );
}

async function Content() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect("/login");

  const { data, error } = await supabase
    .from("user_settings")
    .select("anthropic_api_key, ors_api_key, ai_model")
    .maybeSingle();
  const stored = error ? null : data;
  const tableMissing = Boolean(error);
  // Nur die gespeicherten Werte anzeigen (maskiert); Umgebungsvariablen separat als Hinweis.
  const effective = resolveSettings(stored);
  const fromEnv = {
    anthropic: !stored?.anthropic_api_key && Boolean(effective.anthropicKey),
    ors: !stored?.ors_api_key && Boolean(effective.orsKey),
  };

  return (
    <>
      <Link href="/" className="inline-flex min-h-11 items-center text-sm underline">
        ← Meine Reisen
      </Link>
      <h1 className="text-2xl font-semibold">Einstellungen</h1>
      {tableMissing && (
        <p role="alert" className="rounded-lg border border-amber-600 p-3 text-sm text-amber-800 dark:text-amber-300">
          Die Tabelle «user_settings» fehlt noch. Führe <code>supabase/catch-up.sql</code> im Supabase SQL Editor
          aus und lade die Seite neu.
        </p>
      )}
      <SettingsForm
        anthropicMasked={maskKey(typeof stored?.anthropic_api_key === "string" ? stored.anthropic_api_key : null)}
        orsMasked={maskKey(typeof stored?.ors_api_key === "string" ? stored.ors_api_key : null)}
        model={typeof stored?.ai_model === "string" && stored.ai_model ? stored.ai_model : DEFAULT_MODEL}
        fromEnv={fromEnv}
      />
    </>
  );
}
