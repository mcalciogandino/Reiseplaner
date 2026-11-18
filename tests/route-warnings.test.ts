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

  const k = (name: string, kind: string, a: string, d: string) => ({ name, kind, arrival_date: a, departure_date: d });
  const t2 = { start_date: "2027-06-28", end_date: "2027-07-22" };

  it("zählt Flughäfen, Mietwagenstationen und Tagesbesuche nicht als Aufenthalt", () => {
    const w = routeWarnings(t2, [
      k("Zürich Flughafen", "airport", "2027-06-29", "2027-06-29"),
      k("CanaDream", "car_rental", "2027-06-30", "2027-06-30"),
      k("Hotel", "hotel", "2027-06-28", "2027-07-01"),
      k("Camp", "camping", "2027-07-01", "2027-07-22"),
      k("La Ronde", "attraction", "2027-07-20", "2027-07-20"),
    ]);
    expect(w).toEqual([]);
  });

  it("ordnet nach Datum, nicht nach Routenreihenfolge", () => {
    const w = routeWarnings(t2, [
      k("Camp B", "camping", "2027-07-10", "2027-07-22"),
      k("Camp A", "camping", "2027-06-28", "2027-07-10"),
    ]);
    expect(w).toEqual([]);
  });

  it("ein Stadtbesuch innerhalb eines Campingaufenthalts ist keine Überschneidung", () => {
    const w = routeWarnings(t2, [
      k("Camp", "camping", "2027-07-08", "2027-07-11"),
      k("Quebec-Stadt", "city", "2027-07-09", "2027-07-10"),
      k("Davor", "hotel", "2027-06-28", "2027-07-08"),
      k("Danach", "camping", "2027-07-11", "2027-07-22"),
    ]);
    expect(w).toEqual([]);
  });

  it("zwei überlappende Unterkünfte werden gemeldet, ein langer Eintrag erzeugt nur eine Meldung", () => {
    const w = routeWarnings(t2, [
      k("Lang", "camping", "2027-06-28", "2027-07-22"),
      k("Hotel 1", "hotel", "2027-07-05", "2027-07-08"),
      k("Hotel 2", "hotel", "2027-07-10", "2027-07-12"),
    ]);
    expect(w.filter((x) => x.startsWith("Überschneidung"))).toHaveLength(2);
    expect(w.some((x) => x.includes("Lücke"))).toBe(false);
  });

  it("Lücke am Ende zählt ab dem spätesten Aufenthalt", () => {
    const w = routeWarnings(t2, [k("A", "city", "2027-06-28", "2027-07-20"), k("B", "hotel", "2027-07-01", "2027-07-03")]);
    expect(w).toEqual(["Lücke: 2 Nächte zwischen A und Reiseende."]);
  });
});
