import { describe, expect, it } from "vitest";
import { buildTimeline } from "../src/lib/timeline";
import { logicalOrder, mergeIntoOrder } from "../src/lib/timeline-order";
import type { Destination } from "../src/lib/destinations";
import type { Transfer } from "../src/lib/transfers";

const p = (id: string, arrival_date: string | null = null) => ({ id, arrival_date });
const t = (id: string, from: string | null, to: string | null, depart_at: string | null = null) => ({
  id, from_destination_id: from, to_destination_id: to, depart_at, depart_tz: "UTC", arrive_at: null, arrive_tz: null,
});

describe("logicalOrder", () => {
  it("Verschiebung → Ort → Verschiebung → Ort, auch ohne jede Zeitangabe", () => {
    const o = logicalOrder([p("a"), p("b"), p("c")], [t("2", "b", "c"), t("1", "a", "b")]);
    expect(o).toEqual(["p-a", "t-1", "p-b", "t-2", "p-c"]);
  });

  it("Anreise steht vor dem ersten Ort, Orte nach Datum", () => {
    const o = logicalOrder(
      [p("c", "2027-07-10"), p("a", "2027-07-01"), p("b", "2027-07-05")],
      [t("f", null, "a", "2027-06-30T10:00:00Z"), t("1", "a", "b"), t("2", "b", "c")],
    );
    expect(o).toEqual(["t-f", "p-a", "t-1", "p-b", "t-2", "p-c"]);
  });

  it("Orte ohne Datum bleiben hinter ihrem Vorgänger", () => {
    const o = logicalOrder([p("a", "2027-07-01"), p("x"), p("b", "2027-07-05")], []);
    expect(o).toEqual(["p-a", "p-x", "p-b"]);
  });

  it("Verschiebung ohne Zielort steht nach dem Startort; lose Verschiebung nach Datum", () => {
    const o = logicalOrder(
      [p("a", "2027-07-01"), p("b", "2027-07-09")],
      [t("1", "a", null), { ...t("9", null, null, "2027-07-05T08:00:00Z") }],
    );
    expect(o).toEqual(["p-a", "t-1", "t-9", "p-b"]);
  });

  it("mehrere Verschiebungen zum selben Ort nach Abfahrt", () => {
    const o = logicalOrder([p("a"), p("b")], [t("2", "a", "b", "2027-07-02T10:00:00Z"), t("1", "a", "b", "2027-07-02T08:00:00Z")]);
    expect(o).toEqual(["p-a", "t-1", "t-2", "p-b"]);
  });

  it("die Zeitleiste folgt der Reihenfolge, wenn sie festgelegt wird", () => {
    const dests = ["a", "b"].map((id) => ({ id, name: id, arrival_date: null, departure_date: null, sort_order: 0 }) as unknown as Destination);
    const legs = [{ id: "1", kind: "drive", from_destination_id: "a", to_destination_id: "b", from_place: null, to_place: null, depart_at: null, arrive_at: null } as unknown as Transfer];
    const keys = buildTimeline(dests, legs, logicalOrder(dests, legs)).map((n) => n.key);
    expect(keys).toEqual(["p-a", "t-1", "p-b"]);
  });
});

describe("mergeIntoOrder", () => {
  it("setzt Neues hinter seinen logischen Vorgänger und lässt Bestehendes unberührt", () => {
    const merged = mergeIntoOrder(["p-b", "p-a"], ["p-a", "t-1", "p-b", "t-2", "p-c"], (k) => ["t-1", "t-2", "p-c"].includes(k));
    expect(merged).toEqual(["p-b", "t-2", "p-c", "p-a", "t-1"]); // jeder neue Eintrag folgt seinem logischen Vorgänger
  });

  it("ohne Vorgänger an den Anfang", () => {
    expect(mergeIntoOrder(["p-a"], ["t-0", "p-a"], (k) => k === "t-0")).toEqual(["t-0", "p-a"]);
  });
});
