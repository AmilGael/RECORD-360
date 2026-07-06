import { describe, expect, it } from "vitest";
import { validatePassword, MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";

describe("validatePassword", () => {
  it("rejects passwords shorter than the minimum", () => {
    expect(validatePassword("short").ok).toBe(false);
  });
  it("accepts passwords at the minimum length", () => {
    expect(validatePassword("x".repeat(MIN_PASSWORD_LENGTH)).ok).toBe(true);
  });
});
