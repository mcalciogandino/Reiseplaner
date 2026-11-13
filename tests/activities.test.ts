import { describe, expect, it } from "vitest";
import { activityLines, sortActivities } from "../src/lib/activities";

describe("sortActivities", () => {
  it("sortiert offene zuerst, dann nach Stimmen und Wichtigkeit", () => {
    const out = sortActivities([
      { id: "a", status: "dropped" as const, priority: "high" as const, votes: 5 },
      { id: "b", status: "idea" as const, priority: "low" as const, votes: 1 },
      { id: "c", status: "idea" as const, priority: "medium" as const, votes: 2 },
      { id: "d", status: "idea" as const, priority: "high" as const, votes: 1 },
    ]);
    expect(out.map((x) => x.id)).toEqual(["c", "d", "b", "a"]);
  });
});

describe("activityLines", () => {
  it("nimmt nur geplante oder erledigte Aktivitäten mit Kosten", () => {
    const lines = activityLines([
      { id: "1", title: "Whale Watching", status: "planned", estimated_cost: 200, currency: "CAD" },
      { id: "2", title: "Idee", status: "idea", estimated_cost: 50, currency: "CAD" },
      { id: "3", title: "Ohne Preis", status: "planned", estimated_cost: null, currency: "CAD" },
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ category: "activities", planned: 200, currency: "CAD", origin: "auto" });
  });
});
