import { describe, it, expect } from "vitest";
import { parseChangeTitle, parseRejectionReason } from "@/lib/cambios/validate";

describe("parseChangeTitle", () => {
  it("trims and returns", () => { expect(parseChangeTitle("  Refuerzo  ")).toBe("Refuerzo"); });
  it("rejects empty", () => { expect(() => parseChangeTitle("   ")).toThrow(); });
  it("rejects > 200 chars", () => { expect(() => parseChangeTitle("x".repeat(201))).toThrow(); });
});

describe("parseRejectionReason", () => {
  it("trims and returns", () => { expect(parseRejectionReason("  no procede  ")).toBe("no procede"); });
  it("rejects empty", () => { expect(() => parseRejectionReason("   ")).toThrow(); });
  it("rejects > 1000 chars", () => { expect(() => parseRejectionReason("x".repeat(1001))).toThrow(); });
});
