import { describe, expect, it } from "vitest";
import { dueState, sortItems } from "../src/lib/checklist";

describe("dueState", () => {
  it("unterscheidet überfällig, bald und später; Erledigtes hat keinen Zustand", () => {
    expect(dueState("2027-01-01", false, "2027-01-02")).toBe("overdue");
    expect(dueState("2027-01-20", false, "2027-01-02")).toBe("soon");
    expect(dueState("2027-03-01", false, "2027-01-02")).toBe("later");
    expect(dueState("2027-01-01", true, "2027-01-02")).toBeNull();
    expect(dueState(null, false, "2027-01-02")).toBeNull();
  });
});

describe("sortItems", () => {
  it("offene zuerst, nach Frist, ohne Frist danach, Erledigte unten", () => {
    const r = sortItems([
      { title: "d", due_date: null, done: false },
      { title: "x", due_date: "2027-01-01", done: true },
      { title: "b", due_date: "2027-05-01", done: false },
      { title: "a", due_date: "2027-02-01", done: false },
    ]);
    expect(r.map((i) => i.title)).toEqual(["a", "b", "d", "x"]);
  });
});
