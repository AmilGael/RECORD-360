import { describe, it, expect } from "vitest";
import { computeChangeSeal, type ChangeSealInput } from "@/lib/cambios/seal";

const base: ChangeSealInput = {
  code: "SC-1", title: "Refuerzo", description: "x",
  costImpact: "48000", daysImpact: 3,
  partidaIds: ["b", "a"], authorId: "u1",
  resolvedById: "u2", resolvedAt: new Date("2026-06-04T14:22:00Z"),
};

describe("computeChangeSeal", () => {
  it("is a 64-char hex digest and deterministic", () => {
    const a = computeChangeSeal(base);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(computeChangeSeal(base));
  });
  it("is independent of partidaIds order", () => {
    expect(computeChangeSeal(base)).toBe(computeChangeSeal({ ...base, partidaIds: ["a", "b"] }));
  });
  it("changes when a sealed field changes", () => {
    expect(computeChangeSeal(base)).not.toBe(computeChangeSeal({ ...base, costImpact: "49000" }));
  });
});
