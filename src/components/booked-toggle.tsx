"use client";

import { Check, Clock } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import { setBooked, type BookedTable } from "@/app/trips/[tripId]/booked-actions";
import type { BookStatus } from "@/lib/booking";

/** Badge mit Status; der Zustand steckt immer auch im Text, nicht nur in der Farbe. */
export function StatusBadge({ status }: { status: BookStatus }) {
  if (status === "none") return null;
  return status === "booked" ? (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-green-600 bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-900 dark:border-green-700 dark:bg-green-950 dark:text-green-300">
      <Check aria-hidden="true" className="size-3.5" /> Gebucht
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-600 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-900 dark:border-amber-500 dark:bg-amber-950 dark:text-amber-300">
      <Clock aria-hidden="true" className="size-3.5" /> Noch offen
    </span>
  );
}

/** Checkbox «Gebucht» direkt auf der Karte. */
export function BookedToggle({
  tripId,
  table,
  id,
  booked,
  label,
}: {
  tripId: string;
  table: BookedTable;
  id: string;
  booked: boolean;
  label: string;
}) {
  const [optimistic, setOptimistic] = useOptimistic(booked);
  const [, start] = useTransition();
  return (
    <label className="relative z-10 flex min-h-11 cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={optimistic}
        aria-label={`${label}: gebucht`}
        onChange={(e) => {
          const next = e.target.checked;
          start(async () => {
            setOptimistic(next);
            await setBooked(tripId, table, id, next);
          });
        }}
        className="size-5 accent-green-700"
      />
      Gebucht
    </label>
  );
}
