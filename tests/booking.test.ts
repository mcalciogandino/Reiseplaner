import { describe, expect, it } from "vitest";
import { bookingProgress, placeStatus, transferStatus, vehicleStatus } from "../src/lib/booking";

const place = { booked: false, lodging_name: null, lodging_price: null, lodging_booking_ref: null };

describe("Buchungsstatus", () => {
  it("Orte ohne Unterkunft sind nicht buchbar", () => {
    expect(placeStatus(place)).toBe("none");
    expect(placeStatus({ ...place, lodging_name: "Hotel" })).toBe("open");
    expect(placeStatus({ ...place, lodging_name: "Hotel", booked: true })).toBe("booked");
  });
  it("Campingplätze und Hotels sind auch ohne Unterkunftsangaben buchbar, Aussichtspunkte nicht", () => {
    expect(placeStatus({ ...place, kind: "camping" })).toBe("open");
    expect(placeStatus({ ...place, kind: "hotel", booked: true })).toBe("booked");
    expect(placeStatus({ ...place, kind: "activity" })).toBe("open");
    expect(placeStatus({ ...place, kind: "viewpoint" })).toBe("none");
    expect(placeStatus({ ...place, kind: "viewpoint", booked: true })).toBe("booked");
  });
  it("Verschiebungen: Flug buchbar, eigene Fahrt nicht", () => {
    expect(transferStatus({ booked: false, kind: "flight", booking_ref: null })).toBe("open");
    expect(transferStatus({ booked: false, kind: "drive", booking_ref: null })).toBe("none");
    expect(transferStatus({ booked: false, kind: "transit", booking_ref: null })).toBe("none");
    expect(transferStatus({ booked: false, kind: "drive", booking_ref: "X1" })).toBe("open");
    expect(transferStatus({ booked: true, kind: "drive", booking_ref: null })).toBe("booked");
  });
  it("Fahrzeuge und Fortschritt", () => {
    expect(vehicleStatus({ booked: false })).toBe("open");
    expect(bookingProgress(["booked", "open", "none", "booked"])).toEqual({ booked: 2, total: 3 });
    expect(bookingProgress([])).toEqual({ booked: 0, total: 0 });
  });
});
