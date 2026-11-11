"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createTrip, type TripFormState } from "../actions";

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

export function TripForm() {
  const [state, action, pending] = useActionState<TripFormState, FormData>(
    createTrip,
    null,
  );
  const v = state?.values ?? {};

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field id="name" label="Name der Reise">
        <Input id="name" name="name" required defaultValue={v.name} placeholder="z. B. Kanada 2027" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="origin" label="Startort">
          <Input id="origin" name="origin" required defaultValue={v.origin} placeholder="z. B. Zürich" />
        </Field>
        <Field id="destination" label="Zielort">
          <Input id="destination" name="destination" required defaultValue={v.destination} placeholder="z. B. Vancouver" />
        </Field>
        <Field id="start_date" label="Start">
          <Input id="start_date" name="start_date" type="date" required defaultValue={v.start_date} />
        </Field>
        <Field id="end_date" label="Ende">
          <Input id="end_date" name="end_date" type="date" required defaultValue={v.end_date} />
        </Field>
      </div>
      {state?.message && (
        <p role="alert" className="text-sm text-red-700">
          {state.message}
        </p>
      )}
      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Speichere …" : "Reise anlegen"}
        </Button>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center px-2 text-sm underline"
        >
          Abbrechen
        </Link>
      </div>
    </form>
  );
}
