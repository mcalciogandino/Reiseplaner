"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { changePassword, type PasswordState } from "./password-actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePassword, null);
  return (
    <Card>
      <form action={action} className="flex flex-col gap-4">
        <h2 className="font-semibold">Passwort ändern</h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Passwort vergessen? Melde dich auf der Anmeldeseite mit «Link per E-Mail» an und setze hier ein neues.
        </p>
        <Field id="password" label="Neues Passwort" hint="Mindestens 8 Zeichen.">
          <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={72} />
        </Field>
        <Field id="confirm" label="Neues Passwort wiederholen">
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} maxLength={72} />
        </Field>
        {state && (
          <p role="status" className={state.ok ? "text-sm text-green-700" : "text-sm text-red-700"}>
            {state.message}
          </p>
        )}
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Speichere …" : "Passwort ändern"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
