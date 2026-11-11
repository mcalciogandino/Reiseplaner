import { describe, expect, it } from "vitest";
import { locationSchema, newPlaceBaseSchema } from "../src/lib/place-fields";

const empty = {
  lat: "", lng: "", place_label: "", addr_street: "", addr_house_number: "",
  addr_postcode: "", addr_city: "", addr_region: "", addr_country: "",
};

describe("locationSchema", () => {
  it("rundet Koordinaten und wandelt leere Felder in null", () => {
    const r = locationSchema.parse({ ...empty, lat: "50.1163196", lng: "-122.9573563", place_label: "Whistler", addr_city: "Whistler" });
    expect(r).toMatchObject({ lat: 50.11632, lng: -122.957356, place_label: "Whistler", addr_city: "Whistler", addr_street: null });
  });

  it("lehnt halbe oder ungültige Koordinaten ab", () => {
    expect(locationSchema.safeParse({ ...empty, lat: "50" }).success).toBe(false);
    expect(locationSchema.safeParse({ ...empty, lat: "95", lng: "10" }).success).toBe(false);
  });

  it("verwirft die Beschriftung ohne Koordinaten", () => {
    expect(locationSchema.parse({ ...empty, place_label: "x" }).place_label).toBeNull();
  });
});

describe("newPlaceBaseSchema", () => {
  it("lehnt unbekannte Ortsarten ab", () => {
    expect(newPlaceBaseSchema.safeParse({ name: "X", kind: "ufo", timezone: "", lodging_name: "" }).success).toBe(false);
  });

  it("verlangt einen Namen und eine bekannte Zeitzone", () => {
    expect(newPlaceBaseSchema.safeParse({ name: " ", kind: "city", timezone: "", lodging_name: "" }).success).toBe(false);
    expect(newPlaceBaseSchema.safeParse({ name: "Banff", kind: "city", timezone: "Mars/Olympus", lodging_name: "" }).success).toBe(false);
    expect(newPlaceBaseSchema.parse({ name: "Banff", kind: "national_park", timezone: "America/Edmonton", lodging_name: "" })).toEqual({
      name: "Banff", kind: "national_park", timezone: "America/Edmonton", lodging_name: null,
    });
  });
});
