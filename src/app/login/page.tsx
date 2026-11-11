import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-4">
      <header>
        <h1 className="text-2xl font-semibold">Kanada-Reiseplaner</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Ihr teilt euch einen Zugang. Meldet euch mit der gemeinsamen
          Adresse an.
        </p>
      </header>
      <Suspense>
        <LinkError searchParams={searchParams} />
      </Suspense>
      <Card>
        <LoginForm />
      </Card>
    </main>
  );
}

async function LinkError({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  if (!error) return null;
  return (
    <p role="alert" className="text-sm text-red-700">
      Der Link ist ungültig oder abgelaufen. Bitte einen neuen anfordern.
    </p>
  );
}
