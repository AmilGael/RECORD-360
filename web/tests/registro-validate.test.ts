import { describe, it, expect } from "vitest";
import { parseProgressPct, parseLocation, parseReminderDueAt, parseOfflineReminderDueAt } from "@/lib/registro/validate";
import { zonedTimestamp } from "@/lib/time/zone";
import { thrownText } from "./helpers/user-message";

const sdWall = (d: Date) => zonedTimestamp(d).replace(" ", "T");
const floorToMinute = (d: Date) => new Date(Math.floor(d.getTime() / 60_000) * 60_000);
function madridOffset(d: Date): string {
  const name = new Intl.DateTimeFormat("en", { timeZone: "Europe/Madrid", timeZoneName: "longOffset" })
    .formatToParts(d).find((p) => p.type === "timeZoneName")!.value; // "GMT+02:00"
  return name === "GMT" ? "+00:00" : name.slice(3);
}

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
    expect(thrownText(() => parseReminderDueAt(new Date(Date.now() - 5 * 60_000).toISOString()))).toMatch(/futura/i);
  });
  it("accepts a future reminder", () => {
    const iso = new Date(Date.now() + 60 * 60_000).toISOString();
    expect(parseReminderDueAt(iso)?.toISOString()).toBe(iso);
  });
  it("keeps an explicit offset as given", () => {
    const target = new Date(Date.now() + 2 * 3_600_000);
    const withOffset = `${zonedTimestamp(target, "Europe/Madrid").replace(" ", "T")}:00${madridOffset(target)}`;
    expect(parseReminderDueAt(withOffset)?.toISOString()).toBe(floorToMinute(target).toISOString());
  });
  it("reads an offset-less 'now + 2 h' as Santo Domingo wall time and stores that instant", () => {
    const target = new Date(Date.now() + 2 * 3_600_000);
    const wall = sdWall(target);
    const stored = parseReminderDueAt(wall);
    expect(stored?.toISOString()).toBe(floorToMinute(target).toISOString());
    // Santo Domingo is UTC-4 all year: the stored instant is the wall time + 4 h.
    expect(stored?.toISOString()).toBe(new Date(`${wall}:00-04:00`).toISOString());
  });
  it("still rejects an offset-less wall time that is past in Santo Domingo", () => {
    expect(thrownText(() => parseReminderDueAt(sdWall(new Date(Date.now() - 5 * 60_000))))).toMatch(/futura/i);
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
    expect(thrownText(() => parseOfflineReminderDueAt(reminderAt.toISOString(), capturedAt))).toMatch(/futura/i);
  });
  it("falls back to the strict online rule when clientCapturedAt is missing (no anchor to trust)", () => {
    const pastReminder = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(thrownText(() => parseOfflineReminderDueAt(pastReminder, null))).toMatch(/futura/i);
  });
  it("throws on a malformed date string", () => {
    expect(thrownText(() => parseOfflineReminderDueAt("not-a-date", new Date()))).toMatch(/inválido/i);
  });
  it("reads an offset-less value left in an old queue as Santo Domingo wall time", () => {
    const capturedAt = new Date("2026-01-01T14:00:00.000Z"); // 10:00 in Santo Domingo
    // Typed 11:00 on the device; queued without an offset by an older build.
    expect(parseOfflineReminderDueAt("2026-01-01T11:00", capturedAt)?.toISOString()).toBe("2026-01-01T15:00:00.000Z");
  });
  it("applies the capture-time rule to offset-less values too", () => {
    const capturedAt = new Date("2026-01-01T14:00:00.000Z"); // 10:00 in Santo Domingo
    // 09:59:30 local is inside the 60 s skew; 09:00 local was already past at capture.
    expect(parseOfflineReminderDueAt("2026-01-01T09:59:30", capturedAt)?.toISOString()).toBe("2026-01-01T13:59:30.000Z");
    expect(thrownText(() => parseOfflineReminderDueAt("2026-01-01T09:00", capturedAt))).toMatch(/futura/i);
  });
});
