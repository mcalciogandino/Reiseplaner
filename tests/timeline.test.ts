import { describe, expect, it } from "vitest";
import type { Destination } from "../src/lib/destinations";
import { buildTimeline, insertContext } from "../src/lib/timeline";
import type { Transfer } from "../src/lib/transfers";

const dest = (id: string, extra: Partial<Destination> = {}): Destination => ({
  id, name: id, kind: "city", description: null, arrival_date: null, departure_date: null,
  sort_order: 0, timezone: null, lodging_name: null, lodging_address: null, lodging_checkin: null,
  lodging_booking_ref: null, notes: null, lat: null, lng: null, place_label: null,
  addr_street: null, addr_house_number: null, addr_postcode: null, addr_city: null,
  addr_region: null, addr_country: null, ...extra,
});
const tr = (id: string, extra: Partial<Transfer> = {}): Transfer => ({
  id, kind: "drive", from_destination_id: null, to_destination_id: null, from_place: null,
  to_place: null, depart_at: null, depart_tz: null, arrive_at: null, arrive_tz: null,
  duration_min: null, distance_km: null, carrier: null, flight_number: null, booking_ref: null, from_lat: null, from_lng: null, to_lat: null, to_lng: null, ...extra,
});
const keys = (n: ReturnType<typeof buildTimeline>) => n.map((x) => x.key);

describe("buildTimeline", () => {
  it("ordnet Orte und Verschiebungen abwechselnd nach der Zeit", () => {
    const nodes = buildTimeline(
      [dest("bsl"), dest("yvr", { arrival_date: "2027-07-01" }), dest("wsl", { arrival_date: "2027-07-04" })],
      [
        tr("t2", { from_destination_id: "yvr", to_destination_id: "wsl", depart_at: "2027-07-04T16:00:00Z", arrive_at: "2027-07-04T18:00:00Z" }),
        tr("t1", { kind: "flight", from_destination_id: "bsl", to_destination_id: "yvr", depart_at: "2027-07-01T08:30:00Z", arrive_at: "2027-07-01T19:00:00Z" }),
      ],
    );
    expect(keys(nodes)).toEqual(["p-bsl", "t-t1", "p-yvr", "t-t2", "p-wsl"]);
  });

  it("ordnet freie Orte nach der Zeit ihrer Verschiebung ein", () => {
    const nodes = buildTimeline(
      [dest("bsl"), dest("yvr")],
      [tr("t1", {
        kind: "flight", from_destination_id: "bsl", to_destination_id: "yvr",
        from_place: "Flughafen Zürich", to_place: "Flughafen Vancouver",
        depart_at: "2027-07-01T08:30:00Z", arrive_at: "2027-07-01T19:00:00Z",
      })],
    );
    expect(keys(nodes)).toEqual(["p-bsl", "f-t1-from", "t-t1", "f-t1-to", "p-yvr"]);
  });

  it("zeigt gleiche freie Orte direkt hintereinander nur einmal", () => {
    const nodes = buildTimeline([], [
      tr("a", { to_place: "Flughafen Calgary", depart_at: "2027-07-02T08:00:00Z", arrive_at: "2027-07-02T10:00:00Z" }),
      tr("b", { from_place: "flughafen calgary", depart_at: "2027-07-02T12:00:00Z" }),
    ]);
    expect(nodes.filter((n) => n.type === "free")).toHaveLength(1);
  });

  it("behält die Routenreihenfolge bei Orten ohne Zeitangabe", () => {
    const nodes = buildTimeline([dest("a", { arrival_date: "2027-07-01" }), dest("b"), dest("c")], []);
    expect(keys(nodes)).toEqual(["p-a", "p-b", "p-c"]);
    expect(nodes[1]).toMatchObject({ dated: false });
  });

  it("stellt Verschiebungen ohne Zeit ans Ende", () => {
    const nodes = buildTimeline(
      [dest("a", { arrival_date: "2027-07-01" })],
      [tr("x")],
    );
    expect(keys(nodes)).toEqual(["p-a", "t-x"]);
  });
});

describe("insertContext", () => {
  it("liefert Nachbarorte und Einfügeposition", () => {
    const nodes = buildTimeline(
      [dest("a", { arrival_date: "2027-07-01" }), dest("b", { arrival_date: "2027-07-05" })],
      [tr("t", { from_destination_id: "a", to_destination_id: "b", depart_at: "2027-07-03T08:00:00Z", arrive_at: "2027-07-03T12:00:00Z" })],
    );
    // a, t, b → Plus nach a (Index 1)
    expect(insertContext(nodes, 1)).toEqual({ from: "a", to: "b", position: 1 });
    expect(insertContext(nodes, 0)).toEqual({ from: null, to: "a", position: 0 });
    expect(insertContext(nodes, 3)).toEqual({ from: "b", to: null, position: 2 });
  });
});
