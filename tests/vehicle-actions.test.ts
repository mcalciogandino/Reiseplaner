import { beforeEach, describe, expect, it, vi } from "vitest";

const insert = vi.fn(async () => ({ error: null }));
const update = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: () => ({ insert, update }) }),
}));

const TRIP = "aea9922e-7fcc-4d66-88b8-32b0eb9a1709";
const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

describe("createVehicle", () => {
  beforeEach(() => insert.mockClear());

  it("speichert ein Fahrzeug nur mit Art und Vermieter", async () => {
    const { createVehicle } = await import("../src/app/trips/[tripId]/vehicles/actions");
    await expect(createVehicle(TRIP, null, fd({ kind: "camper", provider: "Canadream" }))).rejects.toThrow(`REDIRECT:/trips/${TRIP}/vehicles`);
    expect(insert).toHaveBeenCalledTimes(1);
    const row = (insert.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(row).toMatchObject({ trip_id: TRIP, kind: "camper", provider: "Canadream", pickup_at: null, pickup_lat: null, source: "user" });
  });

  it("übernimmt Standort und Zeiten", async () => {
    const { createVehicle } = await import("../src/app/trips/[tripId]/vehicles/actions");
    await expect(
      createVehicle(TRIP, null, fd({
        kind: "car", provider: "Avis", pickup_place: "Flughafen Vancouver",
        pickup_local: "2027-07-01T10:00", pickup_tz: "America/Vancouver",
        return_local: "2027-07-10T10:00", return_tz: "America/Vancouver",
        pickup_lat: "49.19", pickup_lng: "-123.18", pickup_place_label: "YVR", pickup_addr_city: "Richmond",
        price: "900", currency: "cad",
      })),
    ).rejects.toThrow("REDIRECT");
    const row = (insert.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(row).toMatchObject({ pickup_lat: 49.19, pickup_lng: -123.18, pickup_label: "YVR", price: 900, currency: "CAD", return_lat: null });
    expect(row.pickup_at).toBe("2027-07-01T17:00:00.000Z");
    expect((row.pickup_address as Record<string, string>).city).toBe("Richmond");
  });

  it("lehnt eine Rückgabe vor der Übernahme ab", async () => {
    const { createVehicle } = await import("../src/app/trips/[tripId]/vehicles/actions");
    const res = await createVehicle(TRIP, null, fd({
      kind: "car", pickup_local: "2027-07-10T10:00", pickup_tz: "UTC", return_local: "2027-07-01T10:00", return_tz: "UTC",
    }));
    expect(res?.message).toMatch(/Rückgabe/);
    expect(insert).not.toHaveBeenCalled();
  });
});
