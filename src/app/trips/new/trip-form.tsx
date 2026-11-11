"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { TripFormState } from "../actions";

type Initial = Partial<
  Record<"name" | "origin" | "destination" | "start_date" | "end_date", string | null>
>;

export function TripForm({
  action,
  initial = {},
  submitLabel,
  cancelHref,
}: {
  action: (prev: TripFormState, formData: FormData) => Promise<TripFormState>;
  initial?: Initial;
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState<TripFormState, FormData>(
    action,
    null,
  );
  const v = (k: keyof Initial) => state?.values[k] ?? initial[k] ?? "";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field id="name" label="Name der Reise">
        <Input id="name" name="name" required defaultValue={v("name")} placeholder="z. B. Kanada 2027" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="origin" label="Startort">
          <Input id="origin" name="origin" required defaultValue={v("origin")} placeholder="z. B. Zürich" />
        </Field>
        <Field id="destination" label="Zielort">
          <Input id="destination" name="destination" required defaultValue={v("destination")} placeholder="z. B. Vancouver" />
        </Field>
        <Field id="start_date" label="Start">
          <Input id="start_date" name="start_date" type="date" required defaultValue={v("start_date")} />
        </Field>
        <Field id="end_date" label="Ende">
          <Input id="end_date" name="end_date" type="date" required defaultValue={v("end_date")} />
        </Field>
      </div>
      {state?.message && (
        <p role="alert" className="text-sm text-red-700">
          {state.message}
        </p>
      )}
      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Speichere …" : submitLabel}
        </Button>
        <Link href={cancelHref} className="inline-flex min-h-11 items-center px-2 text-sm underline">
          Abbrechen
        </Link>
      </div>
    </form>
  );
}
