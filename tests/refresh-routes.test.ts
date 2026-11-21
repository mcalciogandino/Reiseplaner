import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchRoute = vi.fn();
vi.mock("../src/lib/route-service", () => ({ fetchRoute: (...a: unknown[]) => fetchRoute(...a) }));
vi.mock("../src/lib/settings", () => ({ loadSettings: async () => ({ orsKey: "k" }) }));

import { refreshRoutes } from "../src/lib/route-store";

type Row = Record<string, unknown>;
/** Minimaler Supabase-Ersatz: speichert Updates je Fahrt, liefert Fahrten und Orte. */
function fake(legs: Row[], dests: Row[]) {
  const updates: { id: unknown; patch: Row }[] = [];
  const client = {
    from(table: string) {
      let patch: Row | null = null;
      let id: unknown = null;
      const b: Record<string, unknown> = {};
      const result = () => ({ data: table === "transfers" ? legs : dests, error: null });
      b.select = () => b;
      b.in = () => b;
      b.update = (p: Row) => { patch = p; return b; };
      b.eq = (col: string, v: unknown) => { if (col === "id") id = v; return b; };
      b.then = (res: (v: unknown) => unknown) => {
        if (patch) updates.push({ id, patch });
        return Promise.resolve(patch ? { error: null } : result()).then(res);
      };
      return b;
    },
  };
  return { client: client as never, updates };
}

const leg = (id: string, from: string, to: string, route: unknown = null): Row => ({
  id, kind: "drive", from_destination_id: from, to_destination_id: to, from_lat: null, from_lng: null, to_lat: null, to_lng: null, route_geojson: route,
});
const dest = (id: string, located = true): Row => ({ id, lat: located ? 46 : null, lng: located ? 7 : null });
const ok = { ok: true, route: { geometry: { type: "LineString", coordinates: [[7, 46], [8, 47]] }, distanceM: 1000, durationS: 600 } };
const line = { type: "LineString", coordinates: [[7, 46], [8, 47]] };

describe("refreshRoutes", () => {
  beforeEach(() => { fetchRoute.mockReset(); fetchRoute.mockResolvedValue(ok); });

  it("berechnet Fahrten ohne Route, sobald beide Orte einen Standort haben", async () => {
    const { client, updates } = fake([leg("t1", "a", "b"), leg("t2", "b", "c")], [dest("a"), dest("b"), dest("c", false)]);
    expect(await refreshRoutes(client, "trip")).toBe(1);
    expect(fetchRoute).toHaveBeenCalledTimes(1);
    expect(updates.some((u) => u.id === "t1" && u.patch.route_distance_m === 1000)).toBe(true);
  });

  it("lässt vorhandene Routen unberührt, wenn sich nichts geändert hat", async () => {
    const { client } = fake([leg("t1", "a", "b", line)], [dest("a"), dest("b")]);
    expect(await refreshRoutes(client, "trip")).toBe(0);
    expect(fetchRoute).not.toHaveBeenCalled();
  });

  it("berechnet Fahrten neu, deren Start oder Ziel verschoben wurde", async () => {
    const { client } = fake([leg("t1", "a", "b", line), leg("t2", "b", "c", line), leg("t3", "x", "y", line)], [dest("a"), dest("b"), dest("c"), dest("x"), dest("y")]);
    expect(await refreshRoutes(client, "trip", ["b"])).toBe(2);
    expect(fetchRoute).toHaveBeenCalledTimes(2);
  });

  it("ein Fehler des Routendienstes bricht nichts ab", async () => {
    fetchRoute.mockResolvedValue({ ok: false, reason: "failed", message: "x" });
    const { client } = fake([leg("t1", "a", "b")], [dest("a"), dest("b")]);
    expect(await refreshRoutes(client, "trip")).toBe(0);
  });
});
