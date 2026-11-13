import type { BudgetLine } from "./budget";

export const PRIORITIES = ["high", "medium", "low"] as const;
export const STATUSES = ["idea", "planned", "done", "dropped"] as const;
export type Priority = (typeof PRIORITIES)[number];
export type Status = (typeof STATUSES)[number];

export const PRIORITY_LABELS: Record<Priority, string> = { high: "Muss sein", medium: "Gern", low: "Wenn Zeit bleibt" };
export const STATUS_LABELS: Record<Status, string> = { idea: "Idee", planned: "Geplant", done: "Erledigt", dropped: "Verworfen" };

export type Activity = {
  id: string;
  destination_id: string | null;
  title: string;
  description: string | null;
  priority: Priority;
  status: Status;
  estimated_cost: number | null;
  currency: string;
  url: string | null;
  needs_reservation: boolean;
};

export const ACTIVITY_COLUMNS =
  "id, destination_id, title, description, priority, status, estimated_cost, currency, url, needs_reservation";

/** Reihenfolge der Liste: Status (offen zuerst), dann Stimmen, dann Priorität. */
export function sortActivities<T extends Pick<Activity, "status" | "priority"> & { votes: number }>(items: T[]): T[] {
  const s = (x: Status) => ({ idea: 0, planned: 1, done: 2, dropped: 3 })[x];
  const p = (x: Priority) => ({ high: 0, medium: 1, low: 2 })[x];
  return [...items].sort((a, b) => s(a.status) - s(b.status) || b.votes - a.votes || p(a.priority) - p(b.priority));
}

/** Geplante Aktivitäten mit Kostenschätzung als Budgetzeilen (nur solange sie nicht als Posten erfasst sind). */
export function activityLines(
  acts: Pick<Activity, "id" | "title" | "status" | "estimated_cost" | "currency">[],
): BudgetLine[] {
  return acts
    .filter((a) => (a.status === "planned" || a.status === "done") && a.estimated_cost !== null)
    .map((a) => ({
      key: `a-${a.id}`,
      origin: "auto" as const,
      category: "activities" as const,
      description: a.title,
      planned: a.estimated_cost,
      actual: null,
      currency: a.currency,
      rate: null,
    }));
}
