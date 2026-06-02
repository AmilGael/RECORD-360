import { describe, it, expect } from "vitest";
import { projectProgress } from "@/lib/project/progress";

describe("projectProgress", () => {
  it("returns 0 for no partidas", () => {
    expect(projectProgress([])).toBe(0);
  });
  it("returns the rounded average progress", () => {
    expect(projectProgress([{ progressPct: 40 }, { progressPct: 72 }, { progressPct: 100 }])).toBe(71);
  });
  it("handles a single partida", () => {
    expect(projectProgress([{ progressPct: 33 }])).toBe(33);
  });
});
