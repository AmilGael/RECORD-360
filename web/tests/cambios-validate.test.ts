import { describe, it, expect } from "vitest";
import { parseChangeTitle, parseCostImpact, parseDaysImpact } from "@/lib/cambios/validate";

describe("parseChangeTitle", () => {
  it("trims and returns", () => { expect(parseChangeTitle("  Refuerzo  ")).toBe("Refuerzo"); });
  it("rejects empty", () => { expect(() => parseChangeTitle("   ")).toThrow(); });
  it("rejects > 200 chars", () => { expect(() => parseChangeTitle("x".repeat(201))).toThrow(); });
});

describe("parseCostImpact", () => {
  it("empty -> null", () => { expect(parseCostImpact("")).toBeNull(); });
  it("allows negative", () => { expect(parseCostImpact("-1200.5")).toBe("-1200.5"); });
  it("rejects non-numeric", () => { expect(() => parseCostImpact("abc")).toThrow(); });
});

describe("parseDaysImpact", () => {
  it("empty -> null", () => { expect(parseDaysImpact("")).toBeNull(); });
  it("allows negative integer", () => { expect(parseDaysImpact("-2")).toBe(-2); });
  it("rejects decimals", () => { expect(() => parseDaysImpact("1.5")).toThrow(); });
});
