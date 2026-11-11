import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Läuft die echte Migration auf einem echten Postgres (PGlite) gegen eine
// minimale Nachbildung von Supabase (auth.uid(), Rollen, storage-Schema).

const A = "11111111-1111-1111-1111-111111111111"; // gemeinsamer Account
const B = "22222222-2222-2222-2222-222222222222"; // fremder Nutzer
const TRIP = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (
    id text primary key, name text, public boolean,
    file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text, name text, owner uuid);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql as
    $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
`;

const GRANTS = `
  grant usage on schema auth, storage to authenticated;
  grant execute on function auth.uid() to authenticated;
  grant execute on function storage.foldername(text) to authenticated;
  grant select, insert, update, delete on all tables in schema public to authenticated;
  grant select, insert, update, delete on all tables in schema storage to authenticated;
`;

const TRIP_TABLES = [
  "destinations", "documents", "transfers", "lodging_options", "booking_requests",
  "activities", "day_plans", "budget_entries", "checklist_items", "ai_conversations",
];
const ALL_TABLES = [
  "trips", ...TRIP_TABLES, "activity_votes", "day_plan_items", "ai_messages",
  "budget_summary",
];

let db: PGlite;

/** Führt fn als angemeldete Person (oder anon) aus; Transaktion wird zurückgerollt. */
async function as<T>(
  user: string | null,
  fn: (q: (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>) => Promise<T>,
): Promise<T> {
  await db.exec("begin");
  try {
    await db.exec(user ? "set local role authenticated" : "set local role anon");
    if (user) await db.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
    return await fn(
      async (sql, params) => (await db.query<Record<string, unknown>>(sql, params)).rows,
    );
  } finally {
    await db.exec("rollback");
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  const files = process.env.MIGRATION
    ? [process.env.MIGRATION]
    : readdirSync("supabase/migrations")
        .filter((f) => f.endsWith(".sql"))
        .sort()
        .map((f) => `supabase/migrations/${f}`);
  for (const file of files) await db.exec(readFileSync(file, "utf8"));
  await db.exec(GRANTS);
  await db.exec(`
    insert into auth.users values ('${A}'), ('${B}');
    insert into trips (id, name, start_date, end_date, owner_id)
      values ('${TRIP}', 'Kanada', '2027-07-01', '2027-07-21', '${A}');
    insert into destinations (id, trip_id, name) values
      ('d0000000-0000-0000-0000-000000000001', '${TRIP}', 'Vancouver');
    insert into documents (id, trip_id, filename, storage_path, mime_type, size_bytes, category)
      values ('e0000000-0000-0000-0000-000000000001', '${TRIP}', 'flug.pdf',
              'trips/${TRIP}/x.pdf', 'application/pdf', 1000, 'flight');
    insert into transfers (trip_id, kind) values ('${TRIP}', 'flight');
    insert into lodging_options (id, trip_id, destination_id, name, kind)
      values ('f0000000-0000-0000-0000-000000000001', '${TRIP}',
              'd0000000-0000-0000-0000-000000000001', 'Hotel', 'hotel');
    insert into booking_requests (trip_id, lodging_option_id, check_in, check_out, subject, body)
      values ('${TRIP}', 'f0000000-0000-0000-0000-000000000001', '2027-07-01', '2027-07-03', 's', 'b');
    insert into activities (id, trip_id, title)
      values ('c0000000-0000-0000-0000-000000000001', '${TRIP}', 'Seilbahn');
    insert into activity_votes values ('c0000000-0000-0000-0000-000000000001', 'Anna');
    insert into day_plans (id, trip_id, date)
      values ('b0000000-0000-0000-0000-000000000001', '${TRIP}', '2027-07-01');
    insert into day_plan_items (day_plan_id, title)
      values ('b0000000-0000-0000-0000-000000000001', 'Ankunft');
    insert into budget_entries (trip_id, category, description, planned_amount, currency, rate_to_base)
      values ('${TRIP}', 'flights', 'Flug', 1000, 'CAD', 0.65);
    insert into checklist_items (trip_id, title) values ('${TRIP}', 'eTA');
    insert into ai_conversations (id, trip_id)
      values ('a0000000-0000-0000-0000-000000000001', '${TRIP}');
    insert into ai_messages (conversation_id, role, content)
      values ('a0000000-0000-0000-0000-000000000001', 'user', '"hallo"');
    insert into exchange_rates values ('2027-01-01', 'CAD', 'CHF', 0.65);
    insert into storage.objects (bucket_id, name) values ('documents', 'trips/${TRIP}/x.pdf');
  `);
});

afterAll(async () => {
  await db.close();
});

describe("RLS: gemeinsamer Account", () => {
  it.each(ALL_TABLES)("Besitzer sieht Daten in %s", async (table) => {
    const rows = await as(A, (q) => q(`select * from ${table}`));
    expect(rows.length).toBeGreaterThan(0);
  });

  it("Besitzer sieht Dateien im Storage", async () => {
    const rows = await as(A, (q) => q("select name from storage.objects"));
    expect(rows).toHaveLength(1);
  });

  it("budget_summary rechnet in CHF um (1000 CAD × 0.65)", async () => {
    const rows = await as(A, (q) => q("select planned_base from budget_summary"));
    expect(Number(rows[0].planned_base as string)).toBeCloseTo(650);
  });
});

describe("RLS: fremder Nutzer", () => {
  it.each(ALL_TABLES)("sieht keine Daten in %s", async (table) => {
    const rows = await as(B, (q) => q(`select * from ${table}`));
    expect(rows).toHaveLength(0);
  });

  it("sieht keine Dateien im Storage", async () => {
    const rows = await as(B, (q) => q("select name from storage.objects"));
    expect(rows).toHaveLength(0);
  });

  it("kann keine Daten in fremde Reise schreiben", async () => {
    await expect(
      as(B, (q) => q(`insert into destinations (trip_id, name) values ('${TRIP}', 'Hack')`)),
    ).rejects.toThrow(/row-level security/);
    await expect(
      as(B, (q) =>
        q(`insert into activity_votes values ('c0000000-0000-0000-0000-000000000001', 'Hack')`),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("kann fremde Reise nicht ändern oder löschen", async () => {
    const upd = await as(B, (q) => q(`update trips set name = 'Hack' returning id`));
    expect(upd).toHaveLength(0);
    const del = await as(B, (q) => q(`delete from trips returning id`));
    expect(del).toHaveLength(0);
  });

  it("kann keine Reise für fremden Besitzer anlegen", async () => {
    await expect(
      as(B, (q) =>
        q(`insert into trips (name, start_date, end_date, owner_id)
           values ('x', '2027-01-01', '2027-01-02', '${A}')`),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("kann nicht in fremden Storage-Pfad hochladen", async () => {
    await expect(
      as(B, (q) =>
        q(`insert into storage.objects (bucket_id, name)
           values ('documents', 'trips/${TRIP}/evil.pdf')`),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("RLS: nicht angemeldet", () => {
  it("anon hat keinen Zugriff auf trips", async () => {
    await expect(as(null, (q) => q("select * from trips"))).rejects.toThrow(/permission denied/);
  });
});

describe("Mehrere Reisen", () => {
  it("Besitzer kann weitere Reisen mit Start- und Zielort anlegen", async () => {
    const rows = await as(A, async (q) => {
      await q(
        `insert into trips (name, origin, destination, start_date, end_date, owner_id)
         values ('Island', 'Zürich', 'Reykjavik', '2028-05-01', '2028-05-10', '${A}')`,
      );
      return q("select name, origin, destination from trips order by start_date");
    });
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ origin: "Zürich", destination: "Reykjavik" });
  });

  it("fremder Nutzer sieht die weitere Reise nicht", async () => {
    await db.exec(
      `insert into trips (name, start_date, end_date, owner_id)
       values ('Privat', '2028-01-01', '2028-01-02', '${A}')`,
    );
    const rows = await as(B, (q) => q("select * from trips"));
    expect(rows).toHaveLength(0);
    await db.exec("delete from trips where name = 'Privat'");
  });
});

describe("Constraints", () => {
  it("lehnt Reise mit Ende vor Start ab", async () => {
    await expect(
      db.exec(`insert into trips (name, start_date, end_date, owner_id)
               values ('x', '2027-02-02', '2027-02-01', '${A}')`),
    ).rejects.toThrow(/check/);
  });

  it("verlangt Koordinaten nur zusammen und im gültigen Bereich", async () => {
    const ins = (cols: string, vals: string) =>
      db.exec(`insert into destinations (trip_id, name, ${cols}) values ('${TRIP}', 'x', ${vals})`);
    await expect(ins("lat", "49.28")).rejects.toThrow(/check/);
    await expect(ins("lat, lng", "95, 10")).rejects.toThrow(/check/);
    await expect(ins("lat, lng", "49.28, -123.12")).resolves.not.toThrow();
    await db.exec("delete from destinations where name = 'x'");
  });

  it("kennt nur gültige Ortsarten", async () => {
    const ins = (kind: string) =>
      db.exec(`insert into destinations (trip_id, name, kind) values ('${TRIP}', 'k', '${kind}')`);
    await expect(ins("ufo")).rejects.toThrow(/check/);
    await expect(ins("national_park")).resolves.not.toThrow();
    await db.exec("delete from destinations where name = 'k'");
  });

  it("erlaubt pro Reise nur einen Tagesplan je Datum", async () => {
    await expect(
      db.exec(`insert into day_plans (trip_id, date) values ('${TRIP}', '2027-07-01')`),
    ).rejects.toThrow(/duplicate|unique/);
  });
});
