import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

/** Reihenfolge der Kategorienfarben (geprüft mit dem Palette-Validator, hell und dunkel). */
export const SERIES = {
  1: { bar: "bg-[#2a78d6] dark:bg-[#3987e5]", name: "blau" },
  2: { bar: "bg-[#eb6834] dark:bg-[#d95926]", name: "orange" },
} as const;

export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-4" aria-labelledby={id}>
      <h2 id={id} className="text-lg font-semibold">{title}</h2>
      {children}
    </Card>
  );
}

export type Tile = { label: string; value: string; hint?: string };

export function Tiles({ items }: { items: Tile[] }) {
  return (
    <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
      {items.map((t) => (
        <div key={t.label} className="rounded-lg bg-neutral-100 p-3 dark:bg-neutral-800">
          <dt className="text-xs text-neutral-500">{t.label}</dt>
          <dd className="text-lg font-semibold">{t.value}</dd>
          {t.hint && <p className="text-xs text-neutral-600 dark:text-neutral-400">{t.hint}</p>}
        </div>
      ))}
    </dl>
  );
}

export type Bar = {
  label: string;
  value: number;
  /** Text neben dem Balken; die Zahl steht immer als Text da, nie nur als Länge. */
  text: string;
  series?: keyof typeof SERIES;
};

/** Waagrechte Balken: Beschriftung und Wert als Text, Balken dünn mit 4 px abgerundetem Ende. */
export function BarList({ rows, max, label }: { rows: Bar[]; max?: number; label: string }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul aria-label={label} className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={`${r.label}-${r.series ?? 1}`} title={`${r.label}: ${r.text}`}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{r.label}</span>
            <span className="shrink-0 font-medium tabular-nums">{r.text}</span>
          </div>
          <div className="mt-1 h-2.5 rounded-r bg-neutral-100 dark:bg-neutral-800">
            <div
              className={`h-full rounded-r ${SERIES[r.series ?? 1].bar}`}
              style={{ width: `${r.value > 0 ? Math.max(2, Math.min(100, (r.value / top) * 100)) : 0}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Legend({ items }: { items: { series: keyof typeof SERIES; label: string }[] }) {
  return (
    <p className="flex flex-wrap items-center gap-4 text-xs text-neutral-600 dark:text-neutral-400">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={`inline-block size-2.5 rounded-sm ${SERIES[i.series].bar}`} />
          {i.label}
        </span>
      ))}
    </p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-neutral-600 dark:text-neutral-400">{children}</p>;
}
