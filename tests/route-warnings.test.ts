import { describe, expect, it } from "vitest";
import { routeWarnings } from "../src/lib/route-warnings";

const trip = { start_date: "2027-07-01", end_date: "2027-07-10" };
const stop = (name: string, a: string | null, d: string | null) => ({
  name,
  arrival_date: a,
  departure_date: d,
});

describe("routeWarnings", () => {
  it("meldet nichts bei lückenloser Route", () => {
    const w = routeWarnings(trip, [
      stop("Vancouver", "2027-07-01", "2027-07-04"),
      stop("Whistler", "2027-07-04", "2027-07-10"),
    ]);
    expect(w).toEqual([]);
  });

  it("erkennt eine Lücke zwischen zwei Orten", () => {
    const w = routeWarnings(trip, [
      stop("Vancouver", "2027-07-01", "2027-07-03"),
      stop("Whistler", "2027-07-05", "2027-07-10"),
    ]);
    expect(w).toEqual(["Lücke: 2 Nächte ohne Ort zwischen Vancouver und Whistler."]);
  });

  it("erkennt eine Überschneidung", () => {
    const w = routeWarnings(trip, [
      stop("Vancouver", "2027-07-01", "2027-07-05"),
      stop("Whistler", "2027-07-04", "2027-07-10"),
    ]);
    expect(w).toEqual(["Überschneidung: Vancouver und Whistler überlappen um 1 Nacht."]);
  });

  it("erkennt Lücken am Anfang und Ende", () => {
    const w = routeWarnings(trip, [stop("Banff", "2027-07-03", "2027-07-08")]);
    expect(w).toEqual([
      "Lücke: 2 Nächte zwischen Reisestart und Banff.",
      "Lücke: 2 Nächte zwischen Banff und Reiseende.",
    ]);
  });

  it("meldet Orte ausserhalb der Reisedaten", () => {
    const w = routeWarnings(trip, [stop("Jasper", "2027-06-28", "2027-07-10")]);
    expect(w[0]).toContain("Jasper: liegt ausserhalb der Reisedaten");
  });

  it("überspringt Orte ohne Datum", () => {
    expect(routeWarnings(trip, [stop("Calgary", null, null)])).toEqual([]);
  });
});
