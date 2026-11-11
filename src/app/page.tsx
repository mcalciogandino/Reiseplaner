import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./login/actions";

export default function Home() {
  return (
    <Suspense
      fallback={<main className="mx-auto w-full max-w-2xl flex-1 p-4">Lädt …</main>}
    >
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");

  async function logout() {
    "use server";
    await signOut();
    redirect("/login");
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <Card>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Eingeloggt. Hier erscheinen in Phase 2 Countdown, Route, Budget-Ampel
          und die nächsten Termine.
        </p>
      </Card>
      <form action={logout}>
        <Button variant="outline" type="submit">
          Abmelden
        </Button>
      </form>
    </main>
  );
}
