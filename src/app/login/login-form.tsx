"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  sendMagicLink,
  signInWithPassword,
  type LoginState,
} from "./actions";

function Message({ state }: { state: LoginState }) {
  if (!state) return null;
  return (
    <p
      role="status"
      className={state.ok ? "text-sm text-green-700" : "text-sm text-red-700"}
    >
      {state.message}
    </p>
  );
}

export function LoginForm() {
  const [useLink, setUseLink] = useState(false);
  const [pwState, pwAction, pwPending] = useActionState<LoginState, FormData>(
    signInWithPassword,
    null,
  );
  const [linkState, linkAction, linkPending] = useActionState<
    LoginState,
    FormData
  >(sendMagicLink, null);

  return (
    <div className="flex flex-col gap-4">
      {useLink ? (
        <form action={linkAction} className="flex flex-col gap-3">
          <label htmlFor="email-link" className="text-sm font-medium">
            Gemeinsame E-Mail-Adresse
          </label>
          <Input
            id="email-link"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
          />
          <Button type="submit" disabled={linkPending}>
            {linkPending ? "Sende …" : "Login-Link senden"}
          </Button>
          <Message state={linkState} />
        </form>
      ) : (
        <form action={pwAction} className="flex flex-col gap-3">
          <label htmlFor="email" className="text-sm font-medium">
            Gemeinsame E-Mail-Adresse
          </label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            required
          />
          <label htmlFor="password" className="text-sm font-medium">
            Passwort
          </label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          <Button type="submit" disabled={pwPending}>
            {pwPending ? "Melde an …" : "Anmelden"}
          </Button>
          <Message state={pwState} />
        </form>
      )}
      <button
        type="button"
        onClick={() => setUseLink((v) => !v)}
        className="min-h-11 text-sm text-neutral-600 underline dark:text-neutral-400"
      >
        {useLink ? "Stattdessen mit Passwort anmelden" : "Stattdessen Login-Link per E-Mail"}
      </button>
    </div>
  );
}
