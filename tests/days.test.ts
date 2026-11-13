import { describe, expect, it } from "vitest";
import { dayWarnings, eachDate, placesOnDay, programMinutes, transfersOnDay } from "../src/lib/days";

describe("days", () => {
  it("eachDate zählt Tage einschliesslich Start und Ende", () => {
    expect(eachDate("2027-06-29", "2027-07-02")).toEqual(["2027-06-29", "2027-06-30", "2027-07-01", "2027-07-02"]);
    expect(eachDate("2027-07-02", "2027-07-01")).toEqual([]);
  });
  it("placesOnDay: Aufenthalt von Ankunft bis Abreise", () => {
    const p = [
      { id: 1, arrival_date: "2027-07-01", departure_date: "2027-07-03" },
      { id: 2, arrival_date: "2027-07-03", departure_date: null },
      { id: 3, arrival_date: null, departure_date: null },
    ];
    expect(placesOnDay(p, "2027-07-02").map((x) => x.id)).toEqual([1]);
    expect(placesOnDay(p, "2027-07-03").map((x) => x.id)).toEqual([1, 2]);
  });
  it("transfersOnDay nutzt die Ortszeit am Abfahrtsort", () => {
    // 2027-07-02 03:00 UTC = 01.07. 20:00 in Vancouver (UTC-7)
    const t = [{ depart_at: "2027-07-02T03:00:00Z", depart_tz: "America/Vancouver" }];
    expect(transfersOnDay(t, "2027-07-01")).toHaveLength(1);
    expect(transfersOnDay(t, "2027-07-02")).toHaveLength(0);
  });
  it("programMinutes ignoriert Plan B und offene Zeiten; dayWarnings meldet Überlast", () => {
    const items = [
      { start_time: "09:00:00", end_time: "12:30:00", plan_b: false },
      { start_time: "13:00:00", end_time: "15:00:00", plan_b: true },
      { start_time: null, end_time: null, plan_b: false },
    ];
    expect(programMinutes(items)).toBe(210);
    expect(dayWarnings(60, 210)).toEqual([]);
    expect(dayWarnings(7 * 60, 0)).toHaveLength(2 - 1);
    expect(dayWarnings(7 * 60, 6 * 60)).toHaveLength(2);
  });
});
