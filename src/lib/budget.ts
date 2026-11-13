export const CATEGORIES = [
  "flights", "lodging", "camping", "car", "fuel", "transport", "activities", "passes", "insurance", "food", "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  flights: "Flüge",
  lodging: "Unterkunft",
  camping: "Camping",
  car: "Mietwagen / Camper",
  fuel: "Treibstoff",
  transport: "Transport vor Ort",
  activities: "Aktivitäten",
  passes: "Eintritte / Pässe",
  insurance: "Versicherung",
  food: "Essen",
  other: "Sonstiges",
};

export type BudgetLine = {
  key: string;
  origin: "auto" | "manual";
  category: Category;
  description: string;
  planned: number | null;
  actual: number | null;
  currency: string;
  /** Eigener Kurs der Zeile (1 Einheit = rate Basiswährung), sonst Tageskurs. */
  rate: number | null;
  entryId?: string;
  date?: string | null;
};

type Priced = { price: number | null; currency: string | null };

export function destinationLines(
  dests: { id: string; name: string; kind: string; lodging_name: string | null; lodging_price: number | null; lodging_currency: string | null }[],
): BudgetLine[] {
  return dests
    .filter((d) => d.lodging_price !== null)
    .map((d) => ({
      key: `d-${d.id}`,
      origin: "auto" as const,
      category: d.kind === "camping" ? ("camping" as const) : ("lodging" as const),
      description: `${d.lodging_name ?? "Unterkunft"} (${d.name})`,
      planned: d.lodging_price,
      actual: null,
      currency: d.lodging_currency ?? "CAD",
      rate: null,
    }));
}

const TRANSFER_CATEGORY: Record<string, Category> = {
  flight: "flights",
  drive: "fuel",
  car_pickup: "car",
  car_return: "car",
  ferry: "transport",
  train: "transport",
  taxi: "transport",
  bus: "transport",
  transit: "transport",
  shuttle: "transport",
  other: "other",
};

export function transferLines(
  transfers: (Priced & { id: string; kind: string; from_place: string | null; to_place: string | null })[],
  label: (kind: string) => string,
): BudgetLine[] {
  return transfers
    .filter((t) => t.price !== null)
    .map((t) => ({
      key: `t-${t.id}`,
      origin: "auto" as const,
      category: TRANSFER_CATEGORY[t.kind] ?? "other",
      description: `${label(t.kind)}${t.from_place || t.to_place ? `: ${t.from_place ?? "?"} → ${t.to_place ?? "?"}` : ""}`,
      planned: t.price,
      actual: null,
      currency: t.currency ?? "CAD",
      rate: null,
    }));
}

export function vehicleLines(
  vehicles: (Priced & { id: string; kind: string; provider: string | null; vehicle_name: string | null })[],
): BudgetLine[] {
  return vehicles
    .filter((v) => v.price !== null)
    .map((v) => ({
      key: `v-${v.id}`,
      origin: "auto" as const,
      category: "car" as const,
      description: [v.kind === "camper" ? "Camper" : "Mietwagen", v.provider, v.vehicle_name].filter(Boolean).join(" "),
      planned: v.price,
      actual: null,
      currency: v.currency ?? "CAD",
      rate: null,
    }));
}

/** Betrag in Basiswährung; null, wenn kein Kurs bekannt ist. `rates`: 1 Einheit Währung = x Basiswährung. */
export function toBase(amount: number, currency: string, base: string, rates: Record<string, number>, own: number | null = null): number | null {
  if (currency === base) return amount;
  const rate = own ?? rates[currency];
  return rate && rate > 0 ? amount * rate : null;
}

export type CategorySum = { category: Category; planned: number; actual: number; expected: number };
export type Summary = {
  byCategory: CategorySum[];
  planned: number;
  actual: number;
  /** Summe aus «tatsächlich», sonst «geplant» je Zeile. */
  expected: number;
  /** Währungen ohne Kurs: diese Zeilen sind nicht eingerechnet. */
  missing: string[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function summarize(lines: BudgetLine[], base: string, rates: Record<string, number>): Summary {
  const sums = new Map<Category, CategorySum>();
  const missing = new Set<string>();
  for (const l of lines) {
    const planned = l.planned !== null ? toBase(l.planned, l.currency, base, rates, l.rate) : 0;
    const actual = l.actual !== null ? toBase(l.actual, l.currency, base, rates, l.rate) : 0;
    if (planned === null || actual === null) {
      missing.add(l.currency);
      continue;
    }
    const s = sums.get(l.category) ?? { category: l.category, planned: 0, actual: 0, expected: 0 };
    s.planned += planned;
    s.actual += actual;
    s.expected += l.actual !== null ? actual : planned;
    sums.set(l.category, s);
  }
  const byCategory = CATEGORIES.flatMap((c) => {
    const s = sums.get(c);
    return s ? [{ ...s, planned: round2(s.planned), actual: round2(s.actual), expected: round2(s.expected) }] : [];
  });
  return {
    byCategory,
    planned: round2(byCategory.reduce((a, c) => a + c.planned, 0)),
    actual: round2(byCategory.reduce((a, c) => a + c.actual, 0)),
    expected: round2(byCategory.reduce((a, c) => a + c.expected, 0)),
    missing: [...missing].sort(),
  };
}
