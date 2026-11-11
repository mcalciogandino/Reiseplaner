"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendMagicLink, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    sendMagicLink,
    null,
  );

  return (
    <form action={action} className="flex flex-col gap-3">
      <label htmlFor="email" className="text-sm font-medium">
        Gemeinsame E-Mail-Adresse
      </label>
      <Input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        placeholder="name@beispiel.ch"
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Sende …" : "Login-Link senden"}
      </Button>
      {state && (
        <p
          role="status"
          className={state.ok ? "text-sm text-green-700" : "text-sm text-red-700"}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
