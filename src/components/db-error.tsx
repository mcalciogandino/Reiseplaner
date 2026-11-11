type DbError = { code?: string; message?: string } | null | undefined;

// Postgres/PostgREST: fehlende Spalte oder Tabelle (Datenbank hinkt dem Code hinterher).
const SCHEMA_CODES = new Set(["42703", "42P01", "PGRST204", "PGRST200", "PGRST205"]);

/** Meldung, wenn eine Abfrage fehlgeschlagen ist; null, wenn alles in Ordnung ist. */
export function dbErrorMessage(...errors: DbError[]): string | null {
  const failed = errors.find((e) => e);
  if (!failed) return null;
  console.error("Abfrage fehlgeschlagen:", failed.code, failed.message);
  return failed.code && SCHEMA_CODES.has(failed.code)
    ? "Die Datenbank ist nicht auf dem neuesten Stand (es fehlen Spalten). Führe die Datei supabase/catch-up.sql im Supabase SQL Editor aus. Deine Einträge sind nicht gelöscht."
    : "Die Einträge konnten nicht geladen werden. Lade die Seite neu. Deine Einträge sind nicht gelöscht.";
}

/** Sichtbarer Hinweis statt einer scheinbar leeren Liste. */
export function DbErrorNotice({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-lg border border-red-700 bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-100">
      {message}
    </div>
  );
}
