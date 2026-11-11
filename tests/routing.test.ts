import { describe, expect, it } from "vitest";
import { buildMapData } from "../src/lib/map";
import { asRouteLine, parseOrsRoute } from "../src/lib/routing";

const ors = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "LineString", coordinates: [[-123.1207123, 49.2827123], [-122.9, 50.0], [-122.9574, 50.1163]] },
      properties: { summary: { distance: 125432.4, duration: 5400.6 } },
    },
  ],
};

describe("parseOrsRoute", () => {
  it("liest Linie, Strecke und Dauer und rundet", () => {
    const r = parseOrsRoute(ors)!;
    expect(r.distanceM).toBe(125432);
    expect(r.durationS).toBe(5401);
    expect(r.geometry.coordinates[0]).toEqual([-123.12071, 49.28271]);
    expect(r.geometry.coordinates).toHaveLength(3);
  });

  it("verwirft unvollständige oder fremde Antworten", () => {
    expect(parseOrsRoute(null)).toBeNull();
    expect(parseOrsRoute({ error: { code: 2010 } })).toBeNull();
    expect(parseOrsRoute({ features: [{ geometry: { coordinates: [[1, 2]] }, properties: { summary: {} } }] })).toBeNull();
    expect(parseOrsRoute({ features: [{ geometry: { coordinates: [[1, 2], ["x", 3]] }, properties: { summary: { distance: 1, duration: 1 } } }] })).toBeNull();
  });
});

describe("asRouteLine / Karte", () => {
  const dest = (id: string, lat: number, lng: number) => ({ id, name: id, lat, lng });

  it("nimmt nur gültige gespeicherte Linien", () => {
    expect(asRouteLine({ type: "LineString", coordinates: [[1, 2], [3, 4]] })).toEqual([[1, 2], [3, 4]]);
    expect(asRouteLine({ type: "Point", coordinates: [1, 2] })).toBeNull();
    expect(asRouteLine(null)).toBeNull();
  });

  it("zeichnet Autofahrten entlang der Strassenroute, sonst gerade", () => {
    const route = { type: "LineString", coordinates: [[-123.1, 49.3], [-123.0, 49.8], [-122.95, 50.1]] };
    const data = buildMapData(
      [dest("a", 49.3, -123.1), dest("b", 50.1, -122.95)],
      [{ kind: "drive", from_destination_id: "a", to_destination_id: "b", route_geojson: route }],
    );
    expect(data.lines[0]).toEqual({ kind: "drive", coords: route.coordinates });
    const plain = buildMapData(
      [dest("a", 49.3, -123.1), dest("b", 50.1, -122.95)],
      [{ kind: "drive", from_destination_id: "a", to_destination_id: "b", route_geojson: null }],
    );
    expect(plain.lines[0].coords).toHaveLength(2);
  });
});
