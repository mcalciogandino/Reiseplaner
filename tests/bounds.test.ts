import { describe, expect, it } from "vitest";
import { dateBounds, dateTimeBounds } from "../src/lib/trips";

const range = { start_date: "2027-07-01", end_date: "2027-07-21" };

describe("dateBounds", () => {
  it("nutzt den Reisezeitraum", () => {
    expect(dateBounds(range)).toEqual({ min: "2027-07-01", max: "2027-07-21" });
    expect(dateBounds(range, "2027-07-10")).toEqual({ min: "2027-07-01", max: "2027-07-21" });
  });

  it("erweitert die Grenzen für bestehende Werte ausserhalb", () => {
    expect(dateBounds(range, "2027-06-28").min).toBe("2027-06-28");
    expect(dateBounds(range, "2027-07-25").max).toBe("2027-07-25");
  });
});

describe("dateTimeBounds", () => {
  it("deckt den ganzen ersten und letzten Reisetag ab", () => {
    expect(dateTimeBounds(range)).toEqual({ min: "2027-07-01T00:00", max: "2027-07-21T23:59" });
  });

  it("erweitert die Grenzen für bestehende Werte ausserhalb", () => {
    expect(dateTimeBounds(range, "2027-06-30T22:00").min).toBe("2027-06-30T22:00");
    expect(dateTimeBounds(range, "2027-07-22T01:00").max).toBe("2027-07-22T01:00");
  });
});
