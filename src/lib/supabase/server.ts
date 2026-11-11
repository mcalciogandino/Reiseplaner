import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { env } from "@/lib/env";

export async function createClient() {
  // Das Supabase-Paket liest beim Prüfen der Sitzung die Uhrzeit (Date.now()).
  // Zugriffe auf Supabase gehören deshalb immer in die Anfragezeit, nie ins Prerendering.
  await connection();
  const cookieStore = await cookies();
  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Aufruf aus einer Server Component: Session-Refresh übernimmt proxy.ts.
          }
        },
      },
    },
  );
}
