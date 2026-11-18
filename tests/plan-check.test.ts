import { describe, expect, it } from "vitest";
import { checkPlan } from "../src/lib/plan-check";

const trip = { start_date: "2027-06-28", end_date: "2027-07-22" };
const d = (id: string, name: string, arrival_date: string | null = null, departure_date: string | null = null, extra: object = {}) => ({
  id, name, arrival_date, departure_date, lat: null, lng: null, lodging_name: null, lodging_price: null, lodging_booking_ref: null, booked: false, ...extra,
});
const t = (id: string, from: string | null, to: string | null, extra: object = {}) => ({
  id, kind: "drive" as const, from_destination_id: from, to_destination_id: to, from_place: null, to_place: null,
  depart_at: null, depart_tz: null, arrive_at: null, arrive_tz: null, ...extra,
});
const ids = (f: { id: string }[]) => f.map((x) => x.id.split("-")[0]);

describe("checkPlan", () => {
  it("sauberer Plan ohne Befunde", () => {
    expect(checkPlan(trip, [d("a", "Basel", "2027-06-28"), d("b", "Zürich", "2027-06-29")], [t("1", "a", "b")])).toEqual([]);
  });

  it("findet doppelte Orte und behält den vollständigeren", () => {
    const f = checkPlan(
      trip,
      [d("a", "Hotel in Montreal (noch offen)", "2027-06-29", "2027-06-30"), d("b", "Hotel Saint-Laurent (Montreal)", "2027-06-29", "2027-06-30", { lodging_name: "Saint-Laurent", lat: 1, lng: 1 })],
      [],
    );
    const dup = f.find((x) => x.id.startsWith("dup"));
    expect(dup).toBeUndefined(); // verschiedene Namen: kein sicheres Duplikat
    const f2 = checkPlan(trip, [d("a", "CanaDream", "2027-06-30", "2027-06-30"), d("b", "CanaDream Montreal (Mirabel)", "2027-06-30", "2027-06-30", { lat: 1, lng: 2 })], []);
    const m = f2.find((x) => x.fix?.fix.kind === "merge");
    expect(m?.fix?.fix).toEqual({ kind: "merge", keep: "b", remove: "a" });
  });

  it("gleicher Name zu anderer Zeit ist kein Duplikat (Hin- und Rückweg)", () => {
    const f = checkPlan(trip, [d("a", "Basel", "2027-06-28", "2027-06-28"), d("b", "Basel", "2027-07-22", "2027-07-22")], []);
    expect(f.find((x) => x.id.startsWith("dup"))).toBeUndefined();
  });

  it("meldet fehlende Verschiebung und bietet Autofahrt an", () => {
    const f = checkPlan(trip, [d("a", "Quebec", "2027-07-09"), d("b", "Bic", "2027-07-11")], []);
    expect(f[0].fix?.fix).toEqual({ kind: "add_transfer", from: "a", to: "b" });
  });

  it("meldet Überschneidungen und Orte ausserhalb der Reise", () => {
    const f = checkPlan(trip, [d("a", "Bic", "2027-07-11", "2027-07-14"), d("b", "Loup", "2027-07-12", "2027-07-16"), d("c", "Später", "2027-08-01")], [t("1", "a", "b"), t("2", "b", "c")]);
    expect(ids(f)).toContain("overlap");
    expect(ids(f)).toContain("range");
  });

  it("Start der Verschiebung passt nicht zur Route", () => {
    const places = [d("a", "Basel", "2027-06-28"), d("b", "Camp 1", "2027-06-30"), d("c", "Camp 2", "2027-07-02"), d("e", "Loup", "2027-07-04")];
    const f = checkPlan(trip, places, [t("1", "a", "b"), t("2", "b", "c"), t("3", "a", "e")]);
    expect(f.find((x) => x.fix?.fix.kind === "set_transfer_from")?.fix?.fix).toEqual({ kind: "set_transfer_from", transfer: "3", from: "c" });
  });

  it("Ankunftsdatum der Verschiebung widerspricht dem Ort", () => {
    const f = checkPlan(trip, [d("a", "Zürich", "2027-06-28"), d("b", "Montreal", "2027-06-30")], [t("1", "a", "b", { arrive_at: "2027-06-29T19:00:00Z", arrive_tz: "UTC" })]);
    expect(f.find((x) => x.fix?.fix.kind === "set_place_arrival")?.fix?.fix).toEqual({ kind: "set_place_arrival", place: "b", date: "2027-06-29" });
  });

  it("Verschiebung ohne Ziel", () => {
    const f = checkPlan(trip, [d("a", "A", "2027-06-28")], [t("1", "a", null)]);
    expect(ids(f)).toContain("open");
  });
});
