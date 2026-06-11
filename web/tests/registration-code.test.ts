import { describe, it, expect } from "vitest";
import { generateRegistrationCode, isValidRegistrationCode } from "@/lib/project/registration-code";

describe("registration codes (Crockford base32, RPH-XXXX-XXXX)", () => {
  it("generates codes in the canonical format", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateRegistrationCode()).toMatch(/^RPH-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    }
  });
  it("never uses ambiguous characters (I, L, O, U)", () => {
    const joined = Array.from({ length: 200 }, generateRegistrationCode).join("");
    expect(joined).not.toMatch(/[ILOU]/);
  });
  it("validates well-formed codes and rejects garbage", () => {
    expect(isValidRegistrationCode(generateRegistrationCode())).toBe(true);
    expect(isValidRegistrationCode("RPH-1234-567I")).toBe(false); // ambiguous char
    expect(isValidRegistrationCode("XXX-1234-5678")).toBe(false);
    expect(isValidRegistrationCode("RPH-1234")).toBe(false);
    expect(isValidRegistrationCode("rph-1234-5678")).toBe(false); // lowercase
  });
  it("is collision-resistant in a small sample", () => {
    const codes = new Set(Array.from({ length: 1000 }, generateRegistrationCode));
    expect(codes.size).toBe(1000);
  });
});
