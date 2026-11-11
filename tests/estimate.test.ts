import { describe, expect, it } from "vitest";
import { estimateTransfer, haversineKm } from "../src/lib/estimate";
import { isValidTimeZone, zoneOptions } from "../src/lib/timezone";

const zurich = { lat: 47.3769, lng: 8.5417 };
const vancouver = { lat: 49.2827, lng: -123.1207 };
const whistler = { lat: 50.1163, lng: -122.9574 };

describe("haversineKm", () => {
  it("berechnet die Luftlinie", () => {
    expect(haversineKm(zurich, vancouver)).toBeGreaterThan(8200);
    expect(haversineKm(zurich, vancouver)).toBeLessThan(8450);
    expect(haversineKm(zurich, zurich)).toBe(0);
  });
});

describe("estimateTransfer", () => {
  it("schätzt einen Flug mit Zuschlag", () => {
    const e = estimateTransfer("flight", zurich, vancouver)!;
    expect(e.durationMin).toBeGreaterThan(10 * 60);
    expect(e.durationMin).toBeLessThan(13 * 60);
    expect(e.durationMin % 5).toBe(0);
  });

  it("schätzt eine Autofahrt mit Umwegfaktor", () => {
    const e = estimateTransfer("drive", vancouver, whistler)!;
    expect(e.distanceKm).toBeGreaterThan(120);
    expect(e.distanceKm).toBeLessThan(150);
    expect(e.durationMin).toBeGreaterThan(90);
    expect(e.durationMin).toBeLessThan(150);
  });

  it("schätzt nichts für Mietwagen-Termine und Sonstiges", () => {
    expect(estimateTransfer("car_pickup", zurich, vancouver)).toBeNull();
    expect(estimateTransfer("other", zurich, vancouver)).toBeNull();
  });
});

describe("Zeitzonen", () => {
  it("erkennt gültige und ungültige Zonen", () => {
    expect(isValidTimeZone("Europe/Zurich")).toBe(true);
    expect(isValidTimeZone("America/Toronto")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });

  it("ergänzt eine abgeleitete Zone in der Auswahlliste", () => {
    expect(zoneOptions("Asia/Tokyo")[0]).toEqual({ value: "Asia/Tokyo", label: "Asia/Tokyo" });
    expect(zoneOptions("Europe/Zurich").filter((z) => z.value === "Europe/Zurich")).toHaveLength(1);
  });
});
