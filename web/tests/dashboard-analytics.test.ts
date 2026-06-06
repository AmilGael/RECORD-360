import { describe, expect, it } from "vitest";
import { buildDashboardAnalytics } from "@/lib/dashboard/analytics";

describe("buildDashboardAnalytics", () => {
  it("summarizes portfolio metrics and ranks the riskiest projects first", () => {
    const summary = buildDashboardAnalytics([
      {
        id: "a",
        name: "Alpha",
        progress: 85,
        partidas: 10,
        openChanges: 1,
        overdueReminders: 0,
        latestAuthor: "Ana",
        latestTime: "today",
        latestHash: "abc",
      },
      {
        id: "b",
        name: "Bravo",
        progress: 20,
        partidas: 4,
        openChanges: 3,
        overdueReminders: 2,
        latestAuthor: null,
        latestTime: null,
        latestHash: null,
      },
      {
        id: "c",
        name: "Charlie",
        progress: 55,
        partidas: 7,
        openChanges: 0,
        overdueReminders: 1,
        latestAuthor: "Caro",
        latestTime: "later",
        latestHash: "def",
      },
    ]);

    expect(summary.totalProjects).toBe(3);
    expect(summary.totalPartidas).toBe(21);
    expect(summary.avgProgress).toBe(53);
    expect(summary.openChanges).toBe(4);
    expect(summary.overdueReminders).toBe(3);
    expect(summary.healthCounts).toEqual({ red: 1, yellow: 1, green: 1 });
    expect(summary.topRiskProjects.map((p) => p.id)).toEqual(["b", "c", "a"]);
    expect(summary.portfolioHealth).toBe("yellow");
  });
});
