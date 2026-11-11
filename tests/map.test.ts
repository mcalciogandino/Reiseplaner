import { describe, expect, it } from "vitest";
import {
  buildMapData,
  googleMapsDirectionsUrl,
  greatCircleArc,
  transferMapsUrl,
} from "../src/lib/map";

const dest = (id: string, name: string, lat: number | null, lng: number | null) => ({ id, name, lat, lng });
const basel = dest("a", "Basel", 47.5596, 7.5886);
const vancouver = dest("b", "Vancouver", 49.2827, -123.1207);
const whistler = dest("c", "Whistler", 50.1163, -122.9574);
const jasper = dest("d", "Jasper", null, null);

describe("greatCircleArc", () => {
  it("beginnt und endet an den Punkten", () => {
    const arc = greatCircleArc([7.5886, 47.5596], [-123.1207, 49.2827]);
    expect(arc[0][0]).toBeCloseTo(7.5886, 3);
    expect(arc[0][1]).toBeCloseTo(47.5596, 3);
    const last = arc[arc.length - 1];
    expect(last[0]).toBeCloseTo(-123.1207, 3);
    expect(last[1]).toBeCloseTo(49.2827, 3);
  });

  it("wölbt sich Richtung Pol (Basel → Vancouver)", () => {
    const arc = greatCircleArc([7.5886, 47.5596], [-123.1207, 49.2827]);
    const mid = arc[Math.floor(arc.length / 2)];
    const straightMidLat = (47.5596 + 49.2827) / 2;
    expect(mid[1]).toBeGreaterThan(straightMidLat + 5);
  });

  it("springt über den 180°-Meridian nicht quer über die Karte", () => {
    const arc = greatCircleArc([170, 50], [-170, 50]);
    for (let i = 1; i < arc.length; i++) {
      expect(Math.abs(arc[i][0] - arc[i - 1][0])).toBeLessThan(20);
    }
  });

  it("liefert bei identischen Punkten zwei Punkte", () => {
    expect(greatCircleArc([1, 1], [1, 1])).toHaveLength(2);
  });
});

describe("buildMapData", () => {
  it("nummeriert Punkte in Routenreihenfolge und meldet Orte ohne Standort", () => {
    const data = buildMapData([basel, vancouver, jasper, whistler], []);
    expect(data.points.map((p) => [p.name, p.number])).toEqual([["Basel", 1], ["Vancouver", 2], ["Whistler", 4]]);
    expect(data.unlocated).toEqual(["Jasper"]);
  });

  it("zeichnet Flug als Bogen, Fahrt als Linie und den Rest gestrichelt", () => {
    const data = buildMapData(
      [basel, vancouver, whistler],
      [{ kind: "flight", from_destination_id: "a", to_destination_id: "b" }],
    );
    expect(data.lines.map((l) => l.kind)).toEqual(["flight", "route"]);
    expect(data.lines[0].coords.length).toBeGreaterThan(2);
    expect(data.lines[1].coords).toHaveLength(2);
  });

  it("ersetzt die gestrichelte Linie, wenn eine Fahrt existiert (auch rückwärts)", () => {
    const data = buildMapData(
      [vancouver, whistler],
      [{ kind: "drive", from_destination_id: "c", to_destination_id: "b" }],
    );
    expect(data.lines.map((l) => l.kind)).toEqual(["drive"]);
  });

  it("berechnet den Kartenausschnitt", () => {
    const data = buildMapData([basel, vancouver], []);
    expect(data.bounds).toEqual([[-123.1207, 47.5596], [7.5886, 49.2827]]);
    expect(buildMapData([jasper], []).bounds).toBeNull();
  });
});

describe("Google-Maps-Links", () => {
  it("baut einen Routenlink aus Koordinaten", () => {
    const url = googleMapsDirectionsUrl({
      origin: { lat: 49.2827, lng: -123.1207 },
      destination: { lat: 50.1163, lng: -122.9574 },
    });
    expect(url).toBe(
      "https://www.google.com/maps/dir/?api=1&origin=49.282700%2C-123.120700&destination=50.116300%2C-122.957400&travelmode=driving",
    );
  });

  it("begrenzt Zwischenstopps auf 9 und trennt sie mit |", () => {
    const via = Array.from({ length: 12 }, (_, i) => ({ lat: i, lng: i }));
    const url = googleMapsDirectionsUrl({ origin: "A", destination: "B", waypoints: via });
    expect(url.split("%7C")).toHaveLength(9);
  });

  it("nutzt für Fahrten Koordinaten, sonst Namen, und lässt Flüge aus", () => {
    const drive = { kind: "drive" as const, from_destination_id: "b", to_destination_id: "d", from_place: null, to_place: null };
    expect(transferMapsUrl(drive, [vancouver, jasper])).toContain("destination=Jasper");
    expect(transferMapsUrl(drive, [vancouver, jasper])).toContain("origin=49.282700");
    expect(transferMapsUrl({ ...drive, kind: "flight" }, [vancouver, jasper])).toBeNull();
  });

  it("nutzt für Zugfahrten den öV-Modus und freie Orte", () => {
    const url = transferMapsUrl(
      { kind: "train", from_destination_id: null, to_destination_id: null, from_place: "Basel SBB", to_place: "Zürich HB" },
      [],
    );
    expect(url).toContain("origin=Basel%20SBB");
    expect(url).toContain("travelmode=transit");
  });

  it("liefert null, wenn eine Seite fehlt", () => {
    const t = { kind: "drive" as const, from_destination_id: null, to_destination_id: null, from_place: null, to_place: "X" };
    expect(transferMapsUrl(t, [])).toBeNull();
  });
});
