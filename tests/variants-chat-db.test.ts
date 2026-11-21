import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_COPY, planVariantCopy, type Row, type Snapshot } from "../src/lib/variant-copy";

// Prüft die Variantenkopie und den Chat gegen das echte Schema (alle Migrationen auf PGlite).

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
const T = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const D1 = "d0000000-0000-0000-0000-000000000001";
const D2 = "d0000000-0000-0000-0000-000000000002";
const TR = "e1000000-0000-0000-0000-000000000001";
const ACT = "c0000000-0000-0000-0000-000000000001";
const DP = "b0000000-0000-0000-0000-000000000001";

const STUB = `
  create role anon nologin; create role authenticated nologin;
  create schema auth; create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql as
    $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
`;
const GRANTS = `
  grant usage on schema auth, storage to authenticated;
  grant execute on function auth.uid() to authenticated;
  grant execute on function storage.foldername(text) to authenticated;
  grant select, insert, update, delete on all tables in schema public to authenticated;
`;

let db: PGlite;
const rows = async (sql: string, p?: unknown[]) => (await db.query<Row>(sql, p)).rows;

async function as<T2>(user: string, fn: () => Promise<T2>): Promise<T2> {
  await db.exec("begin");
  try {
    await db.exec("set local role authenticated");
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
    return await fn();
  } finally {
    await db.exec("rollback");
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(STUB);
  for (const f of readdirSync("supabase/migrations").filter((x) => x.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(`supabase/migrations/${f}`, "utf8"));
  }
  await db.exec(GRANTS);
  await db.exec(`
    insert into auth.users values ('${A}'), ('${B}');
    insert into trips (id, name, start_date, end_date, owner_id, timeline_order)
      values ('${T}', 'Kanada', '2027-07-01', '2027-07-21', '${A}', '{p-${D1},t-${TR},p-${D2}}');
    insert into destinations (id, trip_id, name, lodging_name, lodging_price, lodging_booking_ref, booked, sort_order) values
      ('${D1}', '${T}', 'Vancouver', 'Hotel', 120, 'ABC', true, 0),
      ('${D2}', '${T}', 'Banff', null, null, null, false, 1);
    insert into transfers (id, trip_id, kind, from_destination_id, to_destination_id, booking_ref, booked, option_group, is_option)
      values ('${TR}', '${T}', 'flight', '${D1}', '${D2}', 'R1', true, 'f0000000-0000-0000-0000-000000000001', false),
             (gen_random_uuid(), '${T}', 'drive', '${D1}', '${D2}', null, false, 'f0000000-0000-0000-0000-000000000001', true);
    insert into vehicles (trip_id, kind, booking_ref, booked, pickup_place) values ('${T}', 'car', 'V1', true, 'YVR');
    insert into activities (id, trip_id, destination_id, title) values ('${ACT}', '${T}', '${D2}', 'Wandern');
    insert into activity_votes values ('${ACT}', 'Anna');
    insert into day_plans (id, trip_id, date, destination_id) values ('${DP}', '${T}', '2027-07-02', '${D1}');
    insert into day_plan_items (day_plan_id, activity_id, transfer_id, title) values ('${DP}', '${ACT}', '${TR}', 'Los');
    insert into budget_entries (trip_id, category, description, planned_amount, currency, rate_to_base, activity_id, transfer_id)
      values ('${T}', 'flights', 'Flug', 1000, 'CAD', 0.65, '${ACT}', '${TR}');
    insert into checklist_items (trip_id, title) values ('${T}', 'eTA');
  `);
});
afterAll(async () => db.close());

async function snapshot(): Promise<Snapshot> {
  const all = (t: string) => rows(`select * from ${t} where trip_id = $1`, [T]);
  return {
    trip: (await rows("select * from trips where id = $1", [T]))[0],
    destinations: await all("destinations"),
    transfers: await all("transfers"),
    vehicles: await all("vehicles"),
    activities: await all("activities"),
    activityVotes: await rows("select * from activity_votes"),
    dayPlans: await all("day_plans"),
    dayPlanItems: await rows("select * from day_plan_items"),
    budgetEntries: await all("budget_entries"),
    checklistItems: await all("checklist_items"),
  };
}

async function insertAll(r: ReturnType<typeof planVariantCopy>) {
  const ins = async (table: string, list: Row[]) => {
    for (const row of list) {
      const cols = Object.keys(row);
      const values = cols.map((c) => {
        const v = row[c];
        return Array.isArray(v) ? `{${v.join(",")}}` : v !== null && typeof v === "object" ? JSON.stringify(v) : v;
      });
      await db.query(`insert into ${table} (${cols.map((c) => `"${c}"`).join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")})`, values);
    }
  };
  await ins("trips", [r.trip]);
  await ins("destinations", r.destinations);
  await ins("vehicles", r.vehicles);
  await ins("transfers", r.transfers);
  await ins("activities", r.activities);
  await ins("activity_votes", r.activityVotes);
  await ins("day_plans", r.dayPlans);
  await ins("day_plan_items", r.dayPlanItems);
  await ins("budget_entries", r.budgetEntries);
  await ins("checklist_items", r.checklistItems);
}

describe("Variantenkopie gegen das echte Schema", () => {
  it("lässt sich vollständig einfügen, mit umgebogenen Verweisen und ohne Buchungen", async () => {
    const NT = "99999999-9999-4999-8999-999999999999";
    const plan = planVariantCopy(await snapshot(), DEFAULT_COPY, NT, "Plan B", A, () => crypto.randomUUID());
    await insertAll(plan);

    const dests = await rows("select * from destinations where trip_id = $1 order by sort_order", [NT]);
    expect(dests).toHaveLength(2);
    expect(dests[0]).toMatchObject({ name: "Vancouver", lodging_name: "Hotel", booked: false, lodging_booking_ref: null });
    const tr = await rows("select * from transfers where trip_id = $1 and not is_option", [NT]);
    expect(tr[0].from_destination_id).toBe(dests[0].id);
    expect(tr[0]).toMatchObject({ booked: false, booking_ref: null });
    const opt = await rows("select * from transfers where trip_id = $1 and is_option", [NT]);
    expect(opt[0].option_group).toBe(tr[0].option_group);
    expect(opt[0].option_group).not.toBe("f0000000-0000-0000-0000-000000000001");
    const items = await rows("select i.* from day_plan_items i join day_plans d on d.id = i.day_plan_id where d.trip_id = $1", [NT]);
    expect(items[0].transfer_id).toBe(tr[0].id);
    const trip = (await rows("select * from trips where id = $1", [NT]))[0];
    expect(trip).toMatchObject({ variant_of: T, variant_name: "Plan B" });
    expect(trip.timeline_order).toEqual([`p-${dests[0].id}`, `t-${tr[0].id}`, `p-${dests[1].id}`]);
    // Quelle bleibt unberührt
    expect((await rows("select booked from destinations where id = $1", [D1]))[0].booked).toBe(true);
  });

  it("Varianten werden mit dem Hauptplan gelöscht", async () => {
    const NT = "88888888-8888-4888-8888-888888888888";
    await insertAll(planVariantCopy(await snapshot(), DEFAULT_COPY, NT, "Weg", A, () => crypto.randomUUID()));
    await db.query("delete from trips where id = $1", [NT]);
    expect(await rows("select 1 from destinations where trip_id = $1", [NT])).toHaveLength(0);
  });
});

describe("chat_messages", () => {
  it("Besitzer schreibt und liest, Fremde sehen nichts", async () => {
    await db.query("insert into chat_messages (trip_id, role, content, proposal) values ($1, 'user', 'Hallo', null)", [T]);
    await db.query(`insert into chat_messages (trip_id, role, content, proposal) values ($1, 'assistant', 'Hi', '{"plan":{}}')`, [T]);
    expect(await as(A, () => rows("select * from chat_messages"))).toHaveLength(2);
    expect(await as(B, () => rows("select * from chat_messages"))).toHaveLength(0);
    await expect(
      as(B, () => db.query("insert into chat_messages (trip_id, role, content) values ($1, 'user', 'x')", [T])),
    ).rejects.toThrow();
  });
});
