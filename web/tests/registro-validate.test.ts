import { describe, it, expect } from "vitest";
import { parseProgressPct, parseLocation, parseReminderDueAt, parseOfflineReminderDueAt } from "@/lib/registro/validate";

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

describe("parseReminderDueAt (online path — stays strict)", () => {
  it("returns null for empty/missing", () => {
    expect(parseReminderDueAt(null)).toBeNull();
    expect(parseReminderDueAt("")).toBeNull();
  });
  it("rejects a reminder more than ~60s in the past relative to now", () => {
    expect(() => parseReminderDueAt(new Date(Date.now() - 5 * 60_000).toISOString())).toThrow(/futura/i);
  });
  it("accepts a future reminder", () => {
    const iso = new Date(Date.now() + 60 * 60_000).toISOString();
    expect(parseReminderDueAt(iso)?.toISOString()).toBe(iso);
  });
});

describe("parseOfflineReminderDueAt (R3 WS10 §5 offline policy)", () => {
  it("returns null for empty/missing regardless of clientCapturedAt", () => {
    expect(parseOfflineReminderDueAt(null, new Date())).toBeNull();
    expect(parseOfflineReminderDueAt("", new Date())).toBeNull();
  });
  it("accepts a reminder that is now in the past but was valid at clientCapturedAt", () => {
    const capturedAt = new Date("2026-01-01T10:00:00.000Z");
    const reminderAt = new Date("2026-01-01T10:05:00.000Z"); // 5 min after capture — valid then
    expect(parseOfflineReminderDueAt(reminderAt.toISOString(), capturedAt)?.toISOString()).toBe(reminderAt.toISOString());
  });
  it("accepts a reminder within the 60s skew buffer before clientCapturedAt", () => {
    const capturedAt = new Date("2026-01-01T10:00:00.000Z");
    const reminderAt = new Date("2026-01-01T09:59:30.000Z"); // 30s before capture — inside the buffer
    expect(parseOfflineReminderDueAt(reminderAt.toISOString(), capturedAt)?.toISOString()).toBe(reminderAt.toISOString());
  });
  it("rejects a reminder that was already more than 60s before clientCapturedAt (invalid even at capture)", () => {
    const capturedAt = new Date("2026-01-01T10:00:00.000Z");
    const reminderAt = new Date("2026-01-01T09:00:00.000Z"); // 1 hour before capture
    expect(() => parseOfflineReminderDueAt(reminderAt.toISOString(), capturedAt)).toThrow(/futura/i);
  });
  it("falls back to the strict online rule when clientCapturedAt is missing (no anchor to trust)", () => {
    const pastReminder = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(() => parseOfflineReminderDueAt(pastReminder, null)).toThrow(/futura/i);
  });
  it("throws on a malformed date string", () => {
    expect(() => parseOfflineReminderDueAt("not-a-date", new Date())).toThrow(/inválido/i);
  });
});
