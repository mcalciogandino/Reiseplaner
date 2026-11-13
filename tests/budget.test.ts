import { describe, expect, it } from "vitest";
import { destinationLines, summarize, toBase, transferLines, type BudgetLine } from "../src/lib/budget";
import { fetchRates } from "../src/lib/fx";

const manual = (o: Partial<BudgetLine>): BudgetLine => ({
  key: "m", origin: "manual", category: "food", description: "x", planned: null, actual: null, currency: "CAD", rate: null, ...o,
});

describe("budget", () => {
  it("toBase rechnet um und meldet fehlende Kurse", () => {
    expect(toBase(100, "CHF", "CHF", {})).toBe(100);
    expect(toBase(100, "CAD", "CHF", { CAD: 0.6 })).toBeCloseTo(60);
    expect(toBase(100, "USD", "CHF", { CAD: 0.6 })).toBeNull();
    expect(toBase(100, "USD", "CHF", {}, 0.9)).toBeCloseTo(90);
  });
  it("sammelt automatische Zeilen aus Unterkünften und Verschiebungen", () => {
    const d = destinationLines([
      { id: "1", name: "Banff", kind: "camping", lodging_name: "Tunnel Mtn", lodging_price: 80, lodging_currency: "CAD" },
      { id: "2", name: "Basel", kind: "city", lodging_name: null, lodging_price: null, lodging_currency: null },
    ]);
    expect(d).toHaveLength(1);
    expect(d[0].category).toBe("camping");
    const t = transferLines(
      [{ id: "a", kind: "taxi", from_place: "YVR", to_place: "Hotel", price: 40, currency: null }, { id: "b", kind: "flight", from_place: null, to_place: null, price: null, currency: null }],
      (k) => k,
    );
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ category: "transport", currency: "CAD" });
  });
  it("summarize: nach Kategorie, tatsächlich vor geplant, fehlende Kurse ausgenommen", () => {
    const s = summarize(
      [
        manual({ category: "food", planned: 500, actual: 450 }),
        manual({ category: "food", planned: 100 }),
        manual({ category: "fuel", planned: 200, currency: "USD" }),
        manual({ category: "other", planned: 50, currency: "CHF" }),
      ],
      "CHF",
      { CAD: 0.5 },
    );
    expect(s.byCategory.map((c) => c.category)).toEqual(["food", "other"]);
    const food = s.byCategory.find((c) => c.category === "food")!;
    expect(food).toMatchObject({ planned: 300, actual: 225, expected: 275 });
    expect(s.missing).toEqual(["USD"]);
    expect(s.expected).toBe(325);
  });
});

describe("fetchRates", () => {
  it("liest Kurse und meldet Fehler je Währung", async () => {
    const fake = (async (url: string) => {
      if (String(url).includes("base=USD")) return { ok: false, status: 500, json: async () => ({}) };
      return { ok: true, json: async () => ({ rates: { CHF: 0.65 } }) };
    }) as unknown as typeof fetch;
    const r = await fetchRates(["CAD", "usd", "CHF", "xx"], "CHF", fake);
    expect(r.rates).toEqual({ CAD: 0.65 });
    expect(r.failed).toEqual(["USD"]);
  });
});
