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

import { suggestVehicle, vehicleUsage } from "../src/lib/vehicles";

describe("suggestVehicle", () => {
  const a = { id: "a", pickup_at: "2027-06-30T21:00:00Z", return_at: "2027-07-10T12:00:00Z" };
  const b = { id: "b", pickup_at: "2027-07-10T12:00:00Z", return_at: "2027-07-21T12:00:00Z" };
  it("schlägt das zur Abfahrt verfügbare Fahrzeug vor", () => {
    expect(suggestVehicle([a, b], "2027-07-02T14:00:00Z")?.id).toBe("a");
    expect(suggestVehicle([a, b], "2027-07-15T14:00:00Z")?.id).toBe("b");
  });
  it("nimmt bei Überschneidung das zuletzt übernommene", () => {
    expect(suggestVehicle([a, b], "2027-07-10T12:00:00Z")?.id).toBe("b");
  });
  it("fällt ohne Abfahrt oder Treffer auf das einzige bzw. zuletzt übernommene Fahrzeug zurück", () => {
    expect(suggestVehicle([a], null)?.id).toBe("a");
    expect(suggestVehicle([a], "2028-01-01T00:00:00Z")?.id).toBe("a");
    expect(suggestVehicle([a, b], null)?.id).toBe("b");
    expect(suggestVehicle([], "2027-07-02T14:00:00Z")).toBeNull();
  });
});

describe("vehicleUsage", () => {
  const d = (vehicle_id: string | null, extra = {}) => ({
    vehicle_id, distance_km: null, route_distance_m: null, duration_min: null, route_duration_s: null, ...extra,
  });
  it("summiert Fahrten, km (Fallback Route) und Fahrzeit (Fallback Route) je Fahrzeug", () => {
    const u = vehicleUsage([
      d("v", { distance_km: 100, duration_min: 90 }),
      d("v", { route_distance_m: 250_400, route_duration_s: 9_000 }),
      d("v"),
      d("w", { distance_km: 5 }),
      d(null, { distance_km: 999 }),
    ]);
    expect(u.get("v")).toEqual({ trips: 3, km: 350, minutes: 240, withoutKm: 1 });
    expect(u.get("w")?.trips).toBe(1);
    expect(u.size).toBe(2);
  });
});
