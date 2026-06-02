import { describe, it, expect } from "vitest";
import { parseSegment } from "@/lib/registro/validate";

describe("parseSegment", () => {
  it("returns null for empty / missing / whitespace", () => {
    expect(parseSegment(null)).toBeNull();
    expect(parseSegment("")).toBeNull();
    expect(parseSegment("   ")).toBeNull();
  });
  it("trims and collapses internal whitespace", () => {
    expect(parseSegment("  Cimentación  ")).toBe("Cimentación");
    expect(parseSegment("Nivel   1   Oeste")).toBe("Nivel 1 Oeste");
  });
  it("rejects an over-long name", () => {
    expect(() => parseSegment("x".repeat(81))).toThrow();
  });
});
