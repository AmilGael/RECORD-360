import { describe, it, expect } from "vitest";
import { parseCategory } from "@/lib/registro/validate";

describe("parseCategory", () => {
  it("returns null for empty / missing input", () => {
    expect(parseCategory(null)).toBeNull();
    expect(parseCategory("")).toBeNull();
    expect(parseCategory(undefined)).toBeNull();
  });

  it("accepts every valid category", () => {
    for (const c of ["MATERIALES", "PROCESOS", "EVENTUALIDADES", "OBSERVACIONES", "COSTOS", "PERSONAL"]) {
      expect(parseCategory(c)).toBe(c);
    }
  });

  it("rejects an unknown category", () => {
    expect(() => parseCategory("BOGUS")).toThrow();
  });
});
