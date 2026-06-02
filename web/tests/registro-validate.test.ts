import { describe, it, expect } from "vitest";
import { parseProgressPct, parseLocation } from "@/lib/registro/validate";

describe("parseProgressPct", () => {
  it("returns null for empty / missing input", () => {
    expect(parseProgressPct(null)).toBeNull();
    expect(parseProgressPct("")).toBeNull();
    expect(parseProgressPct(undefined)).toBeNull();
  });

  it("parses valid integers within 0..100", () => {
    expect(parseProgressPct("0")).toBe(0);
    expect(parseProgressPct("50")).toBe(50);
    expect(parseProgressPct("100")).toBe(100);
  });

  it("rejects values below 0", () => {
    expect(() => parseProgressPct("-1")).toThrow();
    expect(() => parseProgressPct("-500")).toThrow();
  });

  it("rejects values above 100", () => {
    expect(() => parseProgressPct("101")).toThrow();
    expect(() => parseProgressPct("999")).toThrow();
  });

  it("rejects non-integer numbers", () => {
    expect(() => parseProgressPct("3.7")).toThrow();
  });

  it("rejects non-numeric input", () => {
    expect(() => parseProgressPct("abc")).toThrow();
  });
});

describe("parseLocation", () => {
  it("returns null for empty / missing / whitespace", () => {
    expect(parseLocation(null)).toBeNull();
    expect(parseLocation("")).toBeNull();
    expect(parseLocation("   ")).toBeNull();
  });
  it("trims and returns a normal label", () => {
    expect(parseLocation("  Piso 3 - Apto 302  ")).toBe("Piso 3 - Apto 302");
  });
  it("rejects an over-long label", () => {
    expect(() => parseLocation("x".repeat(201))).toThrow();
  });
});
