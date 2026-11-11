"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { MODELS } from "@/lib/settings";
import { saveSettings, testAnthropicKey, type SettingsState } from "./actions";

export function SettingsForm({
  anthropicMasked,
  orsMasked,
  model,
  fromEnv,
}: {
  anthropicMasked: string | null;
  orsMasked: string | null;
  model: string;
  fromEnv: { anthropic: boolean; ors: boolean };
}) {
  const [saved, save, saving] = useActionState<SettingsState, FormData>(saveSettings, null);
  const [tested, test, testing] = useActionState<SettingsState, FormData>(() => testAnthropicKey(), null);

  return (
    <div className="flex flex-col gap-4">
      <form action={save} className="flex flex-col gap-4">
        <Card className="flex flex-col gap-4">
          <h2 className="font-semibold">KI (Claude)</h2>
          <Field
            id="anthropic_api_key"
            label="Claude-API-Schlüssel"
            hint={
              anthropicMasked
                ? `Gespeichert: ${anthropicMasked}. Leer lassen, um ihn zu behalten.`
                : fromEnv.anthropic
                  ? "Aktuell wird der Schlüssel aus der Server-Umgebung verwendet. Ein hier gespeicherter hat Vorrang."
                  : "Erstelle einen Schlüssel unter console.anthropic.com (API keys). Er beginnt mit «sk-ant-»."
            }
          >
            <Input
              id="anthropic_api_key"
              name="anthropic_api_key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={anthropicMasked ?? "sk-ant-…"}
            />
          </Field>
          {anthropicMasked && (
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" name="remove_anthropic" value="1" className="size-5" />
              Gespeicherten Schlüssel entfernen
            </label>
          )}
          <Field id="ai_model" label="Modell">
            <Select id="ai_model" name="ai_model" defaultValue={model}>
              {MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
        </Card>

        <Card className="flex flex-col gap-4">
          <h2 className="font-semibold">Strassenrouten (optional)</h2>
          <Field
            id="ors_api_key"
            label="OpenRouteService-Schlüssel"
            hint={
              orsMasked
                ? `Gespeichert: ${orsMasked}. Leer lassen, um ihn zu behalten.`
                : fromEnv.ors
                  ? "Aktuell wird der Schlüssel aus der Server-Umgebung verwendet."
                  : "Kostenlos unter openrouteservice.org. Ohne Schlüssel gibt es keine eingezeichneten Strassenrouten."
            }
          >
            <Input
              id="ors_api_key"
              name="ors_api_key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={orsMasked ?? ""}
            />
          </Field>
          {orsMasked && (
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" name="remove_ors" value="1" className="size-5" />
              Gespeicherten Schlüssel entfernen
            </label>
          )}
        </Card>

        <p className="text-xs text-neutral-500">
          Die Schlüssel werden in deiner Datenbank gespeichert und nur auf dem Server verwendet, nie an den Browser
          zurückgegeben. Setze in der Anthropic-Console ein monatliches Ausgabenlimit für den Schlüssel.
        </p>
        {saved && (
          <p role="status" className={saved.ok ? "text-sm text-green-700 dark:text-green-400" : "text-sm text-red-700 dark:text-red-400"}>
            {saved.message}
          </p>
        )}
        <div>
          <Button type="submit" disabled={saving}>
            {saving ? "Speichert …" : "Speichern"}
          </Button>
        </div>
      </form>

      <form action={test} className="flex flex-col gap-2">
        <div>
          <Button type="submit" variant="outline" disabled={testing || !(anthropicMasked || fromEnv.anthropic)}>
            {testing ? "Prüft …" : "Claude-Schlüssel testen"}
          </Button>
        </div>
        {tested && (
          <p role="status" className={tested.ok ? "text-sm text-green-700 dark:text-green-400" : "text-sm text-red-700 dark:text-red-400"}>
            {tested.message}
          </p>
        )}
      </form>
    </div>
  );
}
