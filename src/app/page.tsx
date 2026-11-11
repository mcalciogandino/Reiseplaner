import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatRoute, TRIP_COLUMNS, tripDays, type Trip } from "@/lib/trips";
import { signOut } from "./login/actions";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Meine Reisen</h1>
        <Link
          href="/trips/new"
          className="inline-flex min-h-11 items-center rounded-lg bg-red-700 px-4 text-sm font-medium text-white hover:bg-red-800"
        >
          Neue Reise
        </Link>
      </div>
      <Suspense fallback={<p>Lädt …</p>}>
        <TripList />
      </Suspense>
    </main>
  );
}

async function TripList() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect("/login");

  const { data: trips } = await supabase
    .from("trips")
    .select(TRIP_COLUMNS)
    .order("start_date", { ascending: true })
    .returns<Trip[]>();

  async function logout() {
    "use server";
    await signOut();
    redirect("/login");
  }

  return (
    <>
      {!trips?.length ? (
        <Card>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Noch keine Reise. Lege mit «Neue Reise» die erste an.
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {trips.map((t) => (
            <li key={t.id}>
              <Link href={`/trips/${t.id}`} className="block">
                <Card className="transition-colors hover:border-red-700">
                  <h2 className="font-semibold">{t.name}</h2>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    {formatRoute(t) || "Ohne Route"}
                  </p>
                  <p className="mt-1 text-sm">
                    {formatDate(t.start_date)} – {formatDate(t.end_date)} ·{" "}
                    {tripDays(t.start_date, t.end_date)} Tage
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <form action={logout}>
        <Button variant="outline" type="submit">
          Abmelden
        </Button>
      </form>
    </>
  );
}
