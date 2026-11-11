import { describe, expect, it } from "vitest";
import { buildPlan, type GeoHit, type Geocoder, type KnownPlace } from "../src/lib/ai/build-plan";
import { proposeFromText, researchFromText } from "../src/lib/ai/claude";
import { planSchema, proposalSchema } from "../src/lib/ai/plan";
import { TOOL_NAME, tripContext } from "../src/lib/ai/prompt";

const range = { start_date: "2027-06-27", end_date: "2027-07-21" };
const addr = { street: "", house_number: "", postcode: "", city: "", region: "", country: "" };
const hit = (lat: number, lng: number, timezone: string, label = "x"): GeoHit => ({ lat, lng, timezone, label, address: addr });

const DB: Record<string, GeoHit> = {
  "vancouver, british columbia, kanada": hit(49.2827, -123.1207, "America/Vancouver", "Vancouver, British Columbia, Kanada"),
  "whistler, british columbia, kanada": hit(50.1163, -122.9574, "America/Vancouver", "Whistler"),
  "flughafen zürich (zrh)": hit(47.4647, 8.5492, "Europe/Zurich", "Flughafen Zürich"),
};
const geocode: Geocoder = async (q) => DB[q.toLowerCase()] ?? null;

const proposal = proposalSchema.parse({
  summary: "Flug nach Vancouver und Fahrt nach Whistler",
  places: [
    { ref: "p1", name: "Vancouver", kind: "city", search_query: "Vancouver, British Columbia, Kanada", arrival_date: "2027-07-01", departure_date: "2027-07-04", lodging_name: "Hotel am Hafen" },
    { ref: "p2", name: "Whistler", kind: "camping", search_query: "Whistler, British Columbia, Kanada", arrival_date: "2027-07-04" },
  ],
  transfers: [
    { kind: "flight", from_place: "Flughafen Zürich (ZRH)", to_ref: "p1", depart_local: "2027-07-01T10:30", flight_number: "AC 879" },
    { kind: "drive", from_ref: "p1", to_ref: "p2", depart_local: "2027-07-04T09:00" },
  ],
  questions: ["Wie lange bleibt ihr in Whistler?"],
});

describe("proposalSchema", () => {
  it("füllt fehlende Listen und lehnt unbekannte Arten ab", () => {
    expect(proposalSchema.parse({})).toEqual({ summary: "", places: [], transfers: [], questions: [] });
    expect(proposalSchema.safeParse({ places: [{ ref: "p1", name: "X", kind: "ufo" }] }).success).toBe(false);
    expect(proposalSchema.safeParse({ transfers: [{ kind: "teleport" }] }).success).toBe(false);
  });
});

describe("buildPlan", () => {
  it("löst Orte auf, setzt Zeitzonen und schätzt Dauer, Distanz und Ankunft", async () => {
    const plan = await buildPlan(proposal, [], range, geocode);
    expect(plan.places[0]).toMatchObject({ name: "Vancouver", timezone: "America/Vancouver", lat: 49.2827, lodging_name: "Hotel am Hafen" });

    const [flight, drive] = plan.transfers;
    // Flug: freier Start mit Koordinaten, neues Ziel; Abfahrt in Zürcher Zeit
    expect(flight.from).toMatchObject({ place: "Flughafen Zürich (ZRH)", timezone: "Europe/Zurich" });
    expect(flight.to).toMatchObject({ ref: "p1" });
    expect(flight.depart_tz).toBe("Europe/Zurich");
    expect(flight.estimated).toBe(true);
    expect(flight.duration_min).toBeGreaterThan(600);
    expect(flight.arrive_tz).toBe("America/Vancouver");
    expect(flight.arrive_local?.startsWith("2027-07-01")).toBe(true); // Ankunft am selben Kalendertag in Vancouver

    expect(drive.distance_km).toBeGreaterThan(100);
    expect(drive.arrive_local?.startsWith("2027-07-04")).toBe(true);
    expect(planSchema.safeParse(plan).success).toBe(true);
  });

  it("verweist auf bestehende Orte, auch über den Namen, ohne sie neu anzulegen", async () => {
    const known: KnownPlace[] = [
      { id: "11111111-1111-4111-8111-111111111111", name: "Vancouver", timezone: "America/Vancouver", lat: 49.28, lng: -123.12 },
    ];
    const p = proposalSchema.parse({
      places: [],
      transfers: [{ kind: "drive", from_place: "vancouver", to_place: "Whistler", depart_local: "2027-07-04T09:00" }],
    });
    const plan = await buildPlan(p, known, range, async (q) => DB[`${q.toLowerCase()}, british columbia, kanada`] ?? null);
    expect(plan.places).toHaveLength(0);
    expect(plan.transfers[0].from.existing_id).toBe(known[0].id);
    expect(plan.transfers[0].to.place).toBe("Whistler");
  });

  it("übernimmt keine Uhrzeit ohne bekannte Zeitzone und vermerkt es", async () => {
    const p = proposalSchema.parse({
      transfers: [{ kind: "other", from_place: "Irgendwo", to_place: "Anderswo", depart_local: "2027-07-02T08:00" }],
    });
    const plan = await buildPlan(p, [], range, async () => null);
    expect(plan.transfers[0].depart_local).toBeNull();
    expect(plan.transfers[0].warnings.join(" ")).toMatch(/Zeitzone/);
  });

  it("warnt bei Daten ausserhalb der Reise und bei fehlendem Standort", async () => {
    const p = proposalSchema.parse({
      places: [{ ref: "p1", name: "Nirgendwo", kind: "village", arrival_date: "2028-01-01", departure_date: "2027-12-31" }],
    });
    const plan = await buildPlan(p, [], range, async () => null);
    const w = plan.places[0].warnings.join(" ");
    expect(w).toMatch(/Standort/);
    expect(w).toMatch(/ausserhalb/);
    expect(plan.places[0].departure_date).toBeNull(); // Abreise vor Ankunft wird nicht übernommen
  });

  it("überlebt Fehler der Standortsuche", async () => {
    const plan = await buildPlan(proposal, [], range, async () => {
      throw new Error("offline");
    });
    expect(plan.places[0].lat).toBeNull();
    expect(plan.transfers).toHaveLength(2);
  });
});

describe("planSchema", () => {
  it("lehnt manipulierte Pläne ab", async () => {
    const plan = await buildPlan(proposal, [], range, geocode);
    const bad = structuredClone(plan);
    bad.places[0].lat = 123;
    expect(planSchema.safeParse(bad).success).toBe(false);
    const bad2 = structuredClone(plan);
    bad2.places[0].timezone = "Mars/Olympus";
    expect(planSchema.safeParse(bad2).success).toBe(false);
    const bad3 = structuredClone(plan);
    bad3.transfers[0].from.existing_id = "kein-uuid";
    expect(planSchema.safeParse(bad3).success).toBe(false);
  });
});

const CREDS = { apiKey: "sk-ant-test", model: "claude-sonnet-5-5" };

describe("proposeFromText", () => {
  const fake = (content: unknown[]) =>
    ({ messages: { create: async () => ({ content }) } }) as never;

  it("liest den erzwungenen Werkzeugaufruf", async () => {
    const res = await proposeFromText("Wir fliegen nach Vancouver", "ctx", CREDS, fake([
      { type: "tool_use", name: TOOL_NAME, input: { summary: "ok", places: [{ ref: "p1", name: "Vancouver", kind: "city" }], transfers: [], questions: [] } },
    ]));
    expect(res.ok && res.proposal.places[0].name).toBe("Vancouver");
  });

  it("meldet fehlenden Werkzeugaufruf und ungültige Antworten", async () => {
    const none = await proposeFromText("text", "ctx", CREDS, fake([{ type: "text", text: "Hallo" }]));
    expect(none.ok).toBe(false);
    const bad = await proposeFromText("text", "ctx", CREDS, fake([{ type: "tool_use", name: TOOL_NAME, input: { places: [{ ref: "p1", name: "X", kind: "ufo" }] } }]));
    expect(bad.ok).toBe(false);
  });

  it("übersetzt Fehler der API in verständliche Meldungen", async () => {
    const client = (status: number) => ({ messages: { create: async () => { throw Object.assign(new Error("x"), { status }); } } }) as never;
    expect((await proposeFromText("t", "c", CREDS, client(401))) ).toMatchObject({ ok: false, message: expect.stringMatching(/Schlüssel/) });
    expect((await proposeFromText("t", "c", CREDS, client(429))) ).toMatchObject({ ok: false, message: expect.stringMatching(/ausgelastet/) });
    expect((await proposeFromText("t", "c", CREDS, client(500))) ).toMatchObject({ ok: false, message: expect.stringMatching(/nicht erreichbar/) });
  });

  it("verlangt einen Schlüssel, wenn kein Client übergeben wird", async () => {
    const res = await proposeFromText("text", "ctx", { apiKey: null, model: "m" });
    expect(res).toMatchObject({ ok: false, message: expect.stringMatching(/Einstellungen/) });
  });
});

describe("tripContext", () => {
  it("nennt bestehende Orte mit ID", () => {
    const c = tripContext({
      name: "Kanada 2027", start_date: "2027-06-27", end_date: "2027-07-21",
      places: [{ id: "abc", name: "Basel", timezone: null, lat: null, lng: null, arrival_date: null, departure_date: "2027-06-27" }],
      transfers: [],
    });
    expect(c).toContain("Basel (ID abc)");
    expect(c).toContain("noch keine");
  });
});

describe("researchFromText (Websuche)", () => {
  const CREDS = { apiKey: "sk-ant-test", model: "claude-sonnet-5-5" };
  const searchResult = {
    stop_reason: "end_turn",
    content: [
      { type: "web_search_tool_result", content: [{ type: "web_search_result", url: "https://example.com/camp" }] },
      { type: "text", text: "Camp Eins, am See, https://example.com/camp" },
    ],
  };
  const extraction = {
    stop_reason: "tool_use",
    content: [
      {
        type: "tool_use",
        name: TOOL_NAME,
        input: {
          summary: "Ein Campingplatz",
          places: [
            {
              ref: "p1",
              name: "Camp Eins",
              kind: "camping",
              reason: "Am See.",
              sources: ["https://example.com/camp", "https://erfunden.example/x"],
            },
          ],
          transfers: [],
          questions: [],
        },
      },
    ],
  };
  const fake = (replies: unknown[]) => {
    const calls: Record<string, unknown>[] = [];
    return {
      calls,
      client: {
        messages: {
          create: async (args: Record<string, unknown>) => {
            calls.push(JSON.parse(JSON.stringify(args)));
            return replies.shift();
          },
        },
      } as never,
    };
  };

  it("sucht, setzt bei pause_turn fort und behält nur tatsächlich gefundene Quellen", async () => {
    const pause = { stop_reason: "pause_turn", content: [{ type: "text", text: "Zwischenstand" }] };
    const { client, calls } = fake([pause, searchResult, extraction]);
    const res = await researchFromText("Campingplätze am See", "ctx", CREDS, client);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.proposal.places[0].sources).toEqual(["https://example.com/camp"]);
    expect(calls).toHaveLength(3);
    expect(JSON.stringify(calls[0].tools)).toContain("web_search");
    // Fortsetzung schickt die bisherige Antwort mit
    expect((calls[1].messages as unknown[]).length).toBe(2);
    expect(calls[2].tool_choice).toEqual({ type: "tool", name: TOOL_NAME });
  });

  it("meldet verständlich, wenn die Websuche nicht aktiviert ist", async () => {
    const client = {
      messages: { create: async () => { throw Object.assign(new Error("web_search tool is not enabled"), { status: 400 }); } },
    } as never;
    const res = await researchFromText("x", "ctx", CREDS, client);
    expect(res).toMatchObject({ ok: false, message: expect.stringMatching(/Websuche/) });
  });

  it("verlangt einen Schlüssel", async () => {
    const res = await researchFromText("x", "ctx", { apiKey: null, model: "m" });
    expect(res).toMatchObject({ ok: false, message: expect.stringMatching(/Einstellungen/) });
  });
});

describe("Plan mit Quellen", () => {
  it("übernimmt nur http(s)-Quellen und lehnt andere im Plan ab", async () => {
    const p = proposalSchema.parse({
      places: [{ ref: "p1", name: "Camp", kind: "camping", reason: "Schön", sources: ["https://a.example/x", "javascript:alert(1)", "kaputt"] }],
    });
    const plan = await buildPlan(p, [], range, async () => null);
    expect(plan.places[0].sources).toEqual(["https://a.example/x"]);
    expect(plan.places[0].reason).toBe("Schön");
    expect(plan.mode).toBe("capture");
    const bad = JSON.parse(JSON.stringify(plan));
    bad.places[0].sources = ["javascript:alert(1)"];
    expect(planSchema.safeParse(bad).success).toBe(false);
  });
});
