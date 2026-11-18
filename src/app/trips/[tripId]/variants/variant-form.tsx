"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { COPY_OPTIONS, copySummary, DEFAULT_COPY, normalizeOptions, type CopyKey, type CopyOptions } from "@/lib/variant-copy";
import type { VariantFormState } from "./actions";

export function VariantForm({
  action,
  cancelHref,
  sourceLabel,
}: {
  action: (prev: VariantFormState, formData: FormData) => Promise<VariantFormState>;
  cancelHref: string;
  sourceLabel: string;
}) {
  const [state, formAction, pending] = useActionState<VariantFormState, FormData>(action, null);
  const [opts, setOpts] = useState<CopyOptions>(DEFAULT_COPY);
  const eff = normalizeOptions(opts);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field id="name" label="Name der Variante">
        <Input id="name" name="name" required maxLength={60} defaultValue={state?.values.name ?? ""} placeholder="z. B. Mit Rocky Mountaineer" />
      </Field>

      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-medium">Was soll aus «{sourceLabel}» übernommen werden?</legend>
        {COPY_OPTIONS.map(({ key, label, hint }) => {
          const needsPlaces = (key === "transfers" || key === "lodging") && !opts.places;
          return (
            <label key={key} className={`flex min-h-11 items-start gap-3 py-2 ${needsPlaces ? "opacity-50" : ""}`}>
              <input
                type="checkbox"
                name={`copy_${key}`}
                checked={eff[key as CopyKey]}
                disabled={needsPlaces}
                onChange={(e) => setOpts({ ...opts, [key]: e.target.checked })}
                className="mt-0.5 size-5 accent-red-700"
              />
              <span>
                <span className="block text-sm font-medium">{label}</span>
                <span className="block text-xs text-neutral-500">{hint}</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      <p role="status" className="rounded-lg bg-neutral-100 p-3 text-sm dark:bg-neutral-900">
        {copySummary(eff)}
      </p>

      {state?.message && (
        <p role="alert" className="text-sm text-red-700">
          {state.message}
        </p>
      )}
      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Erstelle …" : "Variante erstellen"}
        </Button>
        <Link href={cancelHref} className="inline-flex min-h-11 items-center px-2 text-sm underline">
          Abbrechen
        </Link>
      </div>
    </form>
  );
}
