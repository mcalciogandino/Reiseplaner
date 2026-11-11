import { describe, expect, it } from "vitest";
import { cacheKey, isValidCoord, parseNominatim, roundCoord } from "../src/lib/geocode";

describe("parseNominatim", () => {
  it("wandelt Treffer um und rundet auf 6 Stellen", () => {
    const hits = parseNominatim([
      {
        lat: "50.1163196123",
        lon: "-122.9573563987",
        display_name: "Whistler, British Columbia, Kanada",
        type: "village",
        addresstype: "village",
      },
    ]);
    expect(hits).toEqual([
      { label: "Whistler, British Columbia, Kanada", lat: 50.11632, lng: -122.957356, kind: "village" },
    ]);
  });

  it("verwirft ungültige oder unvollständige Einträge", () => {
    const hits = parseNominatim([
      { lat: "abc", lon: "1", display_name: "kaputt" },
      { lat: "95", lon: "10", display_name: "ausserhalb" },
      { lat: "10", display_name: "ohne lon" },
      { lat: "47.56", lon: "7.59", display_name: "Basel" },
    ]);
    expect(hits.map((h) => h.label)).toEqual(["Basel"]);
  });

  it("liefert bei unerwarteter Antwort eine leere Liste", () => {
    expect(parseNominatim({ error: "x" })).toEqual([]);
    expect(parseNominatim(null)).toEqual([]);
  });
});

describe("Hilfsfunktionen", () => {
  it("prüft Koordinatenbereiche", () => {
    expect(isValidCoord(49.28, -123.12)).toBe(true);
    expect(isValidCoord(91, 0)).toBe(false);
    expect(isValidCoord(0, 181)).toBe(false);
    expect(isValidCoord(NaN, 0)).toBe(false);
  });
  it("rundet", () => expect(roundCoord(1.23456789)).toBe(1.234568));
  it("normalisiert den Cache-Schlüssel", () =>
    expect(cacheKey("  Banff   Springs  Hotel ")).toBe("banff springs hotel"));
});
