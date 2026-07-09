import { describe, it, expect } from "vitest";
import { parseChangeTitle, parseReminderDueAt, parseResolutionNote } from "@/lib/cambios/validate";

describe("parseChangeTitle", () => {
  it("trims and returns", () => { expect(parseChangeTitle("  Refuerzo  ")).toBe("Refuerzo"); });
  it("rejects empty", () => { expect(() => parseChangeTitle("   ")).toThrow(); });
  it("rejects > 200 chars", () => { expect(() => parseChangeTitle("x".repeat(201))).toThrow(); });
});


describe("parseReminderDueAt", () => {
  it("throws when empty — reminders are mandatory on change requests", () => {
    expect(() => parseReminderDueAt("")).toThrow(/obligatorio/i);
    expect(() => parseReminderDueAt(null)).toThrow(/obligatorio/i);
  });
  it("throws on garbage dates", () => {
    expect(() => parseReminderDueAt("not-a-date")).toThrow(/inválido/i);
  });
  it("parses a datetime-local value", () => {
    const d = parseReminderDueAt("2027-01-15T10:00");
    expect(d).toBeInstanceOf(Date);
    expect(d.getFullYear()).toBe(2027);
  });
  it("rejects past dates — a mandatory reminder must be in the future", () => {
    expect(() => parseReminderDueAt("2020-01-01T10:00")).toThrow(/futura/i);
  });
});

describe("parseResolutionNote", () => {
  it("throws when empty — feedback is mandatory on close", () => {
    expect(() => parseResolutionNote("")).toThrow();
  });
  it("trims and returns the note", () => {
    expect(parseResolutionNote("  Aprobado con observaciones  ")).toBe("Aprobado con observaciones");
  });
  it("rejects notes over 1000 chars", () => {
    expect(() => parseResolutionNote("x".repeat(1001))).toThrow(/largo/i);
  });
});
