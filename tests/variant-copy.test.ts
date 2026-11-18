import { describe, expect, it } from "vitest";
import { DEFAULT_COPY, normalizeOptions, planVariantCopy, remapTimelineKey, type Snapshot } from "../src/lib/variant-copy";

let n = 0;
const newId = () => `new-${++n}`;

const snap = (): Snapshot => ({
  trip: { id: "T", name: "Kanada", owner_id: "o", variant_of: null, variant_name: null, timeline_order: ["p-d1", "t-t1", "f-t1-to", "p-gone"], start_date: "2027-07-01", end_date: "2027-07-20", created_at: "x", updated_at: "y" },
  destinations: [
    { id: "d1", trip_id: "T", name: "Vancouver", lodging_name: "Hotel", lodging_price: 100, lodging_booking_ref: "ABC", booked: true, created_at: "x" },
    { id: "d2", trip_id: "T", name: "Banff", lodging_name: null, lodging_booking_ref: null, booked: false },
  ],
  transfers: [
    { id: "t1", trip_id: "T", from_destination_id: "d1", to_destination_id: "d2", booking_ref: "R1", booked: true, option_group: "g", is_option: false, document_id: "doc" },
    { id: "t2", trip_id: "T", from_destination_id: "d1", to_destination_id: "d2", booking_ref: null, booked: false, option_group: "g", is_option: true },
  ],
  vehicles: [{ id: "v1", trip_id: "T", booking_ref: "V9", booked: true }],
  activities: [{ id: "a1", trip_id: "T", destination_id: "d2", title: "Wandern" }],
  activityVotes: [{ activity_id: "a1", voter: "A" }],
  dayPlans: [{ id: "dp1", trip_id: "T", date: "2027-07-02", destination_id: "d1" }],
  dayPlanItems: [{ id: "i1", day_plan_id: "dp1", activity_id: "a1", transfer_id: "t1", title: "Los" }],
  budgetEntries: [{ id: "b1", trip_id: "T", activity_id: "a1", transfer_id: "t1", document_id: "doc", planned_amount: 10 }],
  checklistItems: [{ id: "c1", trip_id: "T", title: "Pass" }],
});

describe("planVariantCopy", () => {
  it("kopiert alles mit neuen IDs und biegt Verweise um", () => {
    const r = planVariantCopy(snap(), DEFAULT_COPY, "NT", "Plan B", "me", newId);
    expect(r.trip).toMatchObject({ id: "NT", variant_of: "T", variant_name: "Plan B", owner_id: "me" });
    expect(r.destinations).toHaveLength(2);
    const d1 = r.destinations[0];
    expect(d1.id).not.toBe("d1");
    expect(d1.trip_id).toBe("NT");
    expect(d1.lodging_name).toBe("Hotel");
    expect(r.transfers[0].from_destination_id).toBe(d1.id);
    expect(r.transfers[0].document_id).toBeNull();
    expect(r.transfers[0].option_group).toBe(r.transfers[1].option_group);
    expect(r.transfers[0].option_group).not.toBe("g");
    expect(r.activityVotes[0].activity_id).toBe(r.activities[0].id);
    expect(r.dayPlanItems[0]).toMatchObject({ day_plan_id: r.dayPlans[0].id, activity_id: r.activities[0].id, transfer_id: r.transfers[0].id });
    expect(r.budgetEntries[0]).toMatchObject({ activity_id: r.activities[0].id, transfer_id: r.transfers[0].id, document_id: null });
    expect(r.trip.timeline_order).toEqual([`p-${d1.id}`, `t-${r.transfers[0].id}`, `f-${r.transfers[0].id}-to`]);
  });

  it("lässt Buchungen weg, solange «Gebucht» aus ist", () => {
    const r = planVariantCopy(snap(), DEFAULT_COPY, "NT", "B", "me", newId);
    expect(r.destinations[0]).toMatchObject({ booked: false, lodging_booking_ref: null });
    expect(r.transfers[0]).toMatchObject({ booked: false, booking_ref: null });
    expect(r.vehicles[0]).toMatchObject({ booked: false, booking_ref: null });
  });

  it("übernimmt Buchungen, wenn gewählt", () => {
    const r = planVariantCopy(snap(), { ...DEFAULT_COPY, booked: true }, "NT", "B", "me", newId);
    expect(r.destinations[0]).toMatchObject({ booked: true, lodging_booking_ref: "ABC" });
    expect(r.transfers[0]).toMatchObject({ booked: true, booking_ref: "R1" });
  });

  it("ohne Unterkunftsdaten bleiben die Orte, aber ohne Unterkunft", () => {
    const r = planVariantCopy(snap(), { ...DEFAULT_COPY, lodging: false, booked: true }, "NT", "B", "me", newId);
    expect(r.destinations[0]).toMatchObject({ lodging_name: null, lodging_price: null, booked: false });
  });

  it("ohne Orte entfallen Verschiebungen, Unterkünfte und Reihenfolge; Verweise werden leer", () => {
    expect(normalizeOptions({ ...DEFAULT_COPY, places: false })).toMatchObject({ transfers: false, lodging: false });
    const r = planVariantCopy(snap(), { ...DEFAULT_COPY, places: false }, "NT", "B", "me", newId);
    expect(r.destinations).toEqual([]);
    expect(r.transfers).toEqual([]);
    expect(r.activities[0].destination_id).toBeNull();
    expect(r.dayPlans[0].destination_id).toBeNull();
    expect(r.dayPlanItems[0].transfer_id).toBeNull();
    expect(r.trip.timeline_order).toEqual([]);
  });

  it("leere Variante kopiert nichts ausser der Reise", () => {
    const none = Object.fromEntries(Object.keys(DEFAULT_COPY).map((k) => [k, false])) as typeof DEFAULT_COPY;
    const r = planVariantCopy(snap(), none, "NT", "Leer", "me", newId);
    expect(Object.entries(r).filter(([k, v]) => k !== "trip" && (v as unknown[]).length)).toEqual([]);
  });

  it("eine Variante einer Variante hängt am Hauptplan", () => {
    const s = snap();
    s.trip.id = "V1";
    s.trip.variant_of = "T";
    expect(planVariantCopy(s, DEFAULT_COPY, "NT", "C", "me", newId).trip.variant_of).toBe("T");
  });

  it("remapTimelineKey", () => {
    const ids = new Map([["a", "x"]]);
    expect(remapTimelineKey("p-a", ids)).toBe("p-x");
    expect(remapTimelineKey("f-a-from", ids)).toBe("f-x-from");
    expect(remapTimelineKey("p-zz", ids)).toBeNull();
  });
});
