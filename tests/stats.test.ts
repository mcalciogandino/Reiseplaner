import { describe, expect, it } from "vitest";
import { activityStats, driveStats, lodgingStats, localDay, nightsOf, overview, reviewStats, type StatDestination, type StatDrive } from "../src/lib/stats";

const place = (extra: Partial<StatDestination> = {}): StatDestination => ({
  kind: "camping", arrival_date: null, departure_date: null, addr_region: null, booked: false, lodging_name: null, ...extra,
});
const drive = (extra: Partial<StatDrive> = {}): StatDrive => ({
  depart_at: null, depart_tz: null, distance_km: null, route_distance_m: null, duration_min: null, route_duration_s: null, ...extra,
});

describe("overview", () => {
  it("zählt Tage, Nächte, Orte und Regionen (ohne Doppelte durch Akzente/Schreibweise)", () => {
    const o = overview({ start_date: "2027-06-29", end_date: "2027-07-22" }, [
      place({ addr_region: "Quebec", arrival_date: "2027-06-30", departure_date: "2027-07-02" }),
      place({ addr_region: "Québec " }),
      place({ addr_region: "Ontario", arrival_date: "2027-07-02", departure_date: "2027-07-05" }),
      place({ addr_region: null, kind: "airport" }),
    ]);
    expect(o).toMatchObject({ days: 24, nights: 23, places: 4, overnightPlaces: 2 });
    expect(o.regions).toEqual(["Ontario", "Quebec"]);
  });
  it("nightsOf braucht beide Daten", () => {
    expect(nightsOf({ arrival_date: "2027-07-02", departure_date: "2027-07-05" })).toBe(3);
    expect(nightsOf({ arrival_date: "2027-07-22", departure_date: null })).toBe(0);
  });
});

describe("driveStats", () => {
  // Abfahrt 14:00 UTC = 10:00 in Toronto: gleicher Kalendertag; 02:00 UTC = Vortag in Toronto.
  it("gruppiert Fahrten nach Ortstag", () => {
    expect(localDay("2027-07-01T14:00:00Z", "America/Toronto")).toBe("2027-07-01");
    expect(localDay("2027-07-02T02:00:00Z", "America/Toronto")).toBe("2027-07-01");
    expect(localDay("2027-07-02T02:00:00Z", null)).toBe("2027-07-02");
  });

  const drives = [
    drive({ depart_at: "2027-06-30T20:00:00Z", depart_tz: "America/Toronto", distance_km: 43, duration_min: 35 }),
    drive({ depart_at: "2027-06-30T20:40:00Z", depart_tz: "America/Toronto", distance_km: 35, duration_min: 30 }),
    drive({ depart_at: "2027-07-05T13:00:00Z", depart_tz: "America/Toronto", distance_km: 430, duration_min: 330 }),
    // Distanz nur aus der Route, Dauer nur aus der Route
    drive({ depart_at: "2027-07-09T14:00:00Z", depart_tz: "America/Toronto", route_distance_m: 315996, route_duration_s: 14645 }),
    drive({ distance_km: 10 }), // ohne Abfahrt
  ];

  it("summiert km und Fahrzeit mit Fallback auf die Strassenroute", () => {
    const s = driveStats(drives, []);
    expect(s.count).toBe(5);
    expect(s.totalKm).toBe(43 + 35 + 430 + 316 + 10);
    expect(s.totalMinutes).toBe(35 + 30 + 330 + 244);
    expect(s.undated).toBe(1);
  });

  it("findet längste und kürzeste Tagesetappe sowie den Durchschnitt je Fahrtag", () => {
    const s = driveStats(drives, []);
    expect(s.driveDays).toBe(3);
    expect(s.longest).toMatchObject({ date: "2027-07-05", km: 430 });
    expect(s.shortest).toMatchObject({ date: "2027-06-30", km: 78 });
    expect(s.avgKmPerDriveDay).toBe(Math.round((78 + 430 + 316) / 3));
  });

  it("zählt als Ruhetage nur Tage mitten im Aufenthalt (≥ 2 Nächte) ohne Fahrt", () => {
    const stay = place({ arrival_date: "2027-07-02", departure_date: "2027-07-05" }); // 3 Nächte: 3. und 4.7.
    expect(driveStats(drives, [stay]).restDays).toBe(2);
    const oneNight = place({ arrival_date: "2027-07-02", departure_date: "2027-07-03" });
    expect(driveStats(drives, [oneNight]).restDays).toBe(0);
    // Wird mitten im Aufenthalt gefahren (Ausflug), ist es kein Ruhetag.
    const withTrip = [...drives, drive({ depart_at: "2027-07-03T14:00:00Z", depart_tz: "America/Toronto", distance_km: 50 })];
    expect(driveStats(withTrip, [stay]).restDays).toBe(1);
  });

  it("kommt ohne Fahrten zurecht", () => {
    expect(driveStats([], [])).toMatchObject({ count: 0, totalKm: 0, driveDays: 0, longest: null, shortest: null, avgKmPerDriveDay: null, restDays: 0 });
  });
});

describe("lodgingStats", () => {
  it("summiert Nächte je Art und zählt gebuchte gegen offene Unterkünfte", () => {
    const s = lodgingStats([
      place({ kind: "camping", arrival_date: "2027-07-02", departure_date: "2027-07-05", booked: true }),
      place({ kind: "camping", arrival_date: "2027-07-05", departure_date: "2027-07-09" }),
      place({ kind: "hotel", arrival_date: "2027-06-29", departure_date: "2027-06-30" }),
      place({ kind: "airport", arrival_date: "2027-06-29", departure_date: "2027-06-29" }),
      place({ kind: "city", lodging_name: "Zuhause", booked: true }),
    ]);
    expect(s.nightsByKind).toEqual([
      { kind: "camping", label: "Campingplatz", nights: 7 },
      { kind: "hotel", label: "Hotel", nights: 1 },
    ]);
    expect(s.totalNights).toBe(8);
    expect(s.booked).toBe(2);
    expect(s.open).toBe(2);
  });
});

describe("activityStats", () => {
  it("zählt nach Status und Wichtigkeit und nennt die Orte mit den meisten Aktivitäten", () => {
    const names = new Map([["d1", "Banff"], ["d2", "Jasper"]]);
    const s = activityStats(
      [
        { status: "idea", priority: "high", destination_id: "d1" },
        { status: "planned", priority: "medium", destination_id: "d1" },
        { status: "done", priority: "low", destination_id: "d2" },
        { status: "dropped", priority: "low", destination_id: "d2" },
        { status: "idea", priority: "high", destination_id: null },
      ],
      names,
    );
    expect(s.total).toBe(5);
    expect(s.byStatus).toEqual([
      { status: "idea", count: 2 }, { status: "planned", count: 1 }, { status: "done", count: 1 }, { status: "dropped", count: 1 },
    ]);
    expect(s.byPriority.find((p) => p.priority === "high")?.count).toBe(2);
    expect(s.topPlaces).toEqual([{ name: "Banff", count: 2 }, { name: "Jasper", count: 1 }]);
  });
});

describe("reviewStats", () => {
  it("zählt reviewed gegen offene je Tabelle und über alle", () => {
    const s = reviewStats([
      { label: "Orte", rows: [{ reviewed: true }, { reviewed: false }, { reviewed: true }] },
      { label: "Fahrzeuge", rows: [] },
      { label: "Checkliste", rows: [{ reviewed: false }] },
    ]);
    expect(s.rows).toEqual([
      { label: "Orte", reviewed: 2, open: 1 },
      { label: "Checkliste", reviewed: 0, open: 1 },
    ]);
    expect(s).toMatchObject({ reviewed: 2, open: 2, share: 0.5 });
    expect(reviewStats([]).share).toBeNull();
  });
});
