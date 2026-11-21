import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Prüft die Migration transfer_vehicle auf echtem Postgres (PGlite): Trigger «gleiche Reise» und Backfill.

const A = "11111111-1111-1111-1111-111111111111";
const T1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1";
const T2 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2";
const V1 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1";
const V2 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2";
const V3 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3";

const STUB = `
  create role anon nologin; create role authenticated nologin;
  create schema auth; create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
`;

let db: PGlite;
const migrations = () =>
  readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort();

beforeAll(async () => {
  db = new PGlite();
  await db.exec(STUB);
  // Alle Migrationen vor transfer_vehicle, dann Testdaten im Zustand «vorher», dann die Migration.
  const all = migrations();
  const idx = all.findIndex((f) => f.includes("transfer_vehicle"));
  expect(idx).toBeGreaterThan(0);
  for (const f of all.slice(0, idx)) await db.exec(readFileSync(`supabase/migrations/${f}`, "utf8"));
  await db.exec(`
    insert into auth.users values ('${A}');
    insert into trips (id, name, start_date, end_date, owner_id) values
      ('${T1}', 'Ein Fahrzeug', '2027-07-01', '2027-07-21', '${A}'),
      ('${T2}', 'Zwei Fahrzeuge', '2027-07-01', '2027-07-21', '${A}');
    insert into vehicles (id, trip_id, kind, pickup_at, return_at) values
      ('${V1}', '${T1}', 'camper', null, null),
      ('${V2}', '${T2}', 'car',    '2027-07-01T10:00Z', '2027-07-10T10:00Z'),
      ('${V3}', '${T2}', 'camper', '2027-07-10T10:00Z', '2027-07-21T10:00Z');
    insert into transfers (id, trip_id, kind, depart_at) values
      ('c0000000-0000-0000-0000-000000000001', '${T1}', 'drive',  '2027-07-05T10:00Z'),
      ('c0000000-0000-0000-0000-000000000002', '${T1}', 'flight', '2027-07-05T10:00Z'),
      ('c0000000-0000-0000-0000-000000000003', '${T2}', 'drive',  '2027-07-03T10:00Z'),
      ('c0000000-0000-0000-0000-000000000004', '${T2}', 'drive',  '2027-07-15T10:00Z'),
      ('c0000000-0000-0000-0000-000000000005', '${T2}', 'drive',  null);
  `);
  for (const f of all.slice(idx)) await db.exec(readFileSync(`supabase/migrations/${f}`, "utf8"));
});

afterAll(async () => {
  await db.close();
});

const vehicleOf = async (id: string) =>
  ((await db.query<{ vehicle_id: string | null }>("select vehicle_id from transfers where id = $1", [id])).rows[0]).vehicle_id;

describe("Migration transfer_vehicle", () => {
  it("backfill: ein Fahrzeug → alle Autofahrten, andere Arten bleiben leer", async () => {
    expect(await vehicleOf("c0000000-0000-0000-0000-000000000001")).toBe(V1);
    expect(await vehicleOf("c0000000-0000-0000-0000-000000000002")).toBeNull();
  });

  it("backfill: mehrere Fahrzeuge → nach Zeitraum; ohne Abfahrt bleibt es leer", async () => {
    expect(await vehicleOf("c0000000-0000-0000-0000-000000000003")).toBe(V2);
    expect(await vehicleOf("c0000000-0000-0000-0000-000000000004")).toBe(V3);
    expect(await vehicleOf("c0000000-0000-0000-0000-000000000005")).toBeNull();
  });

  it("ein Fahrzeug einer anderen Reise wird abgelehnt", async () => {
    await expect(
      db.query("update transfers set vehicle_id = $1 where id = 'c0000000-0000-0000-0000-000000000001'", [V2]),
    ).rejects.toThrow(/gehört nicht zur Reise/);
  });

  it("wird das Fahrzeug gelöscht, bleibt die Fahrt ohne Fahrzeug bestehen", async () => {
    await db.exec(`delete from vehicles where id = '${V3}'`);
    expect(await vehicleOf("c0000000-0000-0000-0000-000000000004")).toBeNull();
    const rows = (await db.query("select id from transfers where id = 'c0000000-0000-0000-0000-000000000004'")).rows;
    expect(rows).toHaveLength(1);
  });

  it("läuft mehrfach, ohne zu scheitern (idempotent)", async () => {
    const file = migrations().find((f) => f.includes("transfer_vehicle"))!;
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  });
});
