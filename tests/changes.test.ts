import { describe, expect, it } from "vitest";
import { chatReply, CHAT_TOOL_NAME } from "../src/lib/ai/chat";
import { resolveChanges, type Change } from "../src/lib/ai/changes";
import type { Destination } from "../src/lib/destinations";
import type { Transfer } from "../src/lib/transfers";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const T1 = "33333333-3333-4333-8333-333333333333";
const GONE = "99999999-9999-4999-8999-999999999999";

const place = (id: string, name: string, extra: object = {}) =>
  ({ id, name, timezone: "America/Toronto", arrival_date: "2027-06-29", departure_date: "2027-06-30", lodging_name: null, lodging_checkin: null, lodging_checkout: null, lodging_price: null, lodging_currency: null, notes: null, description: null, ...extra }) as unknown as Destination;
const leg = (id: string, extra: object = {}) =>
  ({ id, kind: "drive", from_destination_id: A, to_destination_id: B, from_place: null, to_place: null, depart_at: null, depart_tz: null, arrive_at: null, arrive_tz: null, carrier: null, flight_number: null, price: null, currency: null, notes: null, ...extra }) as unknown as Transfer;
const places = [place(A, "Montreal"), place(B, "Ottawa", { arrival_date: "2027-06-30", departure_date: "2027-07-02" })];

describe("resolveChanges", () => {
  it("zeigt Vorher und Nachher und ignoriert Unverändertes", () => {
    const c: Change[] = [{ op: "update_place", id: A, set: { name: "Montréal", arrival_date: "2027-06-29", lodging_name: "Hotel X" } }];
    const [r] = resolveChanges(c, places, []);
    expect(r.lines).toEqual(["Name: Montreal → Montréal", "Unterkunft: – → Hotel X"]);
    expect(r.patch).toEqual({ name: "Montréal", lodging_name: "Hotel X" });
  });

  it("verwirft Änderungen an unbekannten IDs und leere Änderungen", () => {
    expect(resolveChanges([{ op: "delete_place", id: GONE }, { op: "update_place", id: A, set: { name: "Montreal" } }], places, [])).toEqual([]);
  });

  it("Abreise vor Ankunft wird nicht übernommen", () => {
    const [r] = resolveChanges([{ op: "update_place", id: A, set: { departure_date: "2027-06-01", lodging_name: "H" } }], places, []);
    expect(r.patch).toEqual({ lodging_name: "H" });
    expect(r.warnings.join(" ")).toMatch(/Abreise/);
  });

  it("Löschen eines Ortes warnt vor verwaisten Verschiebungen", () => {
    const [r] = resolveChanges([{ op: "delete_place", id: A }], places, [leg(T1)]);
    expect(r.patch).toBeNull();
    expect(r.warnings.join(" ")).toMatch(/1 Verschiebung/);
  });

  it("Verschiebung: Ortszeit wird mit der Zeitzone des Ortes umgerechnet, Endpunktwechsel löscht die Route", () => {
    const [r] = resolveChanges([{ op: "update_transfer", id: T1, set: { depart_local: "2027-06-30T10:00", to_destination_id: A } }], places, [leg(T1)]);
    expect(r.patch).toMatchObject({ depart_at: "2027-06-30T14:00:00.000Z", depart_tz: "America/Toronto", to_destination_id: A, route_geojson: null });
  });

  it("Verschiebung: unbekannter Zielort und Ankunft vor Abfahrt werden abgefangen", () => {
    const [r] = resolveChanges(
      [{ op: "update_transfer", id: T1, set: { to_destination_id: GONE, carrier: "VIA", depart_local: "2027-06-30T10:00", arrive_local: "2027-06-30T08:00" } }],
      places,
      [leg(T1)],
    );
    expect(r.patch).toEqual({ carrier: "VIA" });
    expect(r.warnings.join(" ")).toMatch(/existiert nicht/);
    expect(r.warnings.join(" ")).toMatch(/Ankunft läge vor der Abfahrt/);
  });

  it("Löschen einer Verschiebung", () => {
    const [r] = resolveChanges([{ op: "delete_transfer", id: T1 }], places, [leg(T1)]);
    expect(r.title).toMatch(/Verschiebung löschen: .*Montreal → Ottawa/);
  });
});

describe("chatReply mit Änderungen", () => {
  const fake = (input: unknown) =>
    ({ messages: { create: async () => ({ content: [{ type: "tool_use", name: CHAT_TOOL_NAME, input }] }) } }) as never;
  const creds = { apiKey: null, model: "m" };

  it("liefert geprüfte Änderungen", async () => {
    const r = await chatReply([{ role: "user", content: "x" }], "c", creds, {}, fake({ message: "ok", changes: [{ op: "delete_place", id: A, reason: "doppelt" }] }));
    expect(r.ok && r.changes).toEqual([{ op: "delete_place", id: A, reason: "doppelt" }]);
  });

  it("ungültige Änderungen (keine UUID) werden verworfen, der Text bleibt", async () => {
    const r = await chatReply([{ role: "user", content: "x" }], "c", creds, {}, fake({ message: "ok", changes: [{ op: "delete_place", id: "nicht-uuid" }] }));
    expect(r.ok && r.changes).toEqual([]);
    expect(r.ok && r.message).toMatch(/unvollständig/);
  });
});
