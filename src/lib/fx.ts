export type RateResult = { rates: Record<string, number>; failed: string[] };

/**
 * Tageskurse (EZB) über frankfurter.dev, kostenlos und ohne Schlüssel.
 * Ergebnis: 1 Einheit Währung = x Basiswährung. Fehlgeschlagene Währungen stehen in `failed`.
 */
export async function fetchRates(
  currencies: string[],
  base: string,
  fetchFn: typeof fetch = fetch,
): Promise<RateResult> {
  const wanted = [...new Set(currencies.map((c) => c.toUpperCase()))].filter((c) => /^[A-Z]{3}$/.test(c) && c !== base);
  const rates: Record<string, number> = {};
  const failed: string[] = [];
  await Promise.all(
    wanted.map(async (cur) => {
      try {
        const res = await fetchFn(`https://api.frankfurter.dev/v1/latest?base=${cur}&symbols=${base}`, {
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as { rates?: Record<string, number> };
        const rate = json.rates?.[base];
        if (typeof rate !== "number" || !(rate > 0)) throw new Error("no rate");
        rates[cur] = rate;
      } catch {
        failed.push(cur);
      }
    }),
  );
  return { rates, failed: failed.sort() };
}
