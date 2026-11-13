import { describe, expect, it } from "vitest";
import { availableVehicles } from "../src/lib/vehicles";

describe("availableVehicles", () => {
  const v = [
    { id: 1, pickup_at: "2027-01-30T18:00:00Z", return_at: "2027-02-04T18:00:00Z" },
    { id: 2, pickup_at: null, return_at: null },
  ];
  it("liefert Fahrzeuge nur im Mietzeitraum; ohne Zeiten immer", () => {
    expect(availableVehicles(v, "2027-01-29T12:00:00Z").map((x) => x.id)).toEqual([2]);
    expect(availableVehicles(v, "2027-02-01T12:00:00Z").map((x) => x.id)).toEqual([1, 2]);
    expect(availableVehicles(v, "2027-02-05T12:00:00Z").map((x) => x.id)).toEqual([2]);
  });
});
