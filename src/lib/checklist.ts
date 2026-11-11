export type ChecklistItem = {
  id: string;
  list: "prep" | "packing";
  title: string;
  due_date: string | null;
  done: boolean;
  notes: string | null;
  source_ref: string | null;
  source: "user" | "ai";
};

export const CHECKLIST_COLUMNS = "id, list, title, due_date, done, notes, source_ref, source";

export type DueState = "overdue" | "soon" | "later" | null;

/** Fällig: überfällig (vor heute), bald (innerhalb von 30 Tagen) oder später. Erledigtes hat keinen Zustand. */
export function dueState(due: string | null, done: boolean, today: string): DueState {
  if (!due || done) return null;
  if (due < today) return "overdue";
  const days = (Date.parse(due) - Date.parse(today)) / 86_400_000;
  return days <= 30 ? "soon" : "later";
}

/** Offene zuerst, nach Frist (ohne Frist am Ende), Erledigte unten. */
export function sortItems<T extends Pick<ChecklistItem, "done" | "due_date" | "title">>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.due_date !== b.due_date) {
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date < b.due_date ? -1 : 1;
    }
    return a.title.localeCompare(b.title, "de");
  });
}
