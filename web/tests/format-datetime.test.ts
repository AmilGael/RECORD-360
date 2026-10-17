import { describe, it, expect } from "vitest";
import { formatDate, formatRecordTime, formatTimestamp } from "@/lib/format/datetime";

// Expectations are exact strings in America/Santo_Domingo (UTC-4): the suite
// must pass the same under TZ=UTC and TZ=Asia/Tokyo. Intl may use narrow
// no-break spaces (e.g. before "PM"), so compare whitespace-normalized.
const norm = (s: string) => s.replace(/\s/g, " ");

const now = new Date("2026-05-31T12:00:00.000Z");
const ago = (ms: number) => new Date(now.getTime() - ms);
const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("formatTimestamp", () => {
  it("shows a 'just now' label under a minute", () => {
    expect(formatTimestamp(ago(30 * SEC), "es", now)).toBe("ahora");
    expect(formatTimestamp(ago(30 * SEC), "en", now)).toBe("now");
  });

  it("shows relative minutes under an hour", () => {
    expect(formatTimestamp(ago(5 * MIN), "es", now)).toBe("hace 5 min");
    expect(formatTimestamp(ago(5 * MIN), "en", now)).toBe("5 min ago");
  });

  it("shows relative hours under a day", () => {
    expect(formatTimestamp(ago(2 * HOUR), "es", now)).toBe("hace 2 h");
    expect(formatTimestamp(ago(2 * HOUR), "en", now)).toBe("2 h ago");
  });

  it("falls back to an absolute date and time in Santo Domingo beyond a day", () => {
    // 2026-05-28T12:00Z is 08:00 in Santo Domingo.
    expect(norm(formatTimestamp(ago(3 * DAY), "es", now))).toBe("28 may 2026, 8:00");
    expect(norm(formatTimestamp(ago(3 * DAY), "en", now))).toBe("May 28, 2026, 8:00 AM");
  });

  it("shows future instants as absolute, never 'ahora'", () => {
    // now + 2 h = 14:00Z = 10:00 in Santo Domingo.
    expect(norm(formatTimestamp(new Date(now.getTime() + 2 * HOUR), "es", now))).toBe("31 may 2026, 10:00");
    expect(norm(formatTimestamp(new Date(now.getTime() + 2 * HOUR), "en", now))).toBe("May 31, 2026, 10:00 AM");
  });
});

describe("formatDate", () => {
  // Date columns previously did formatTimestamp(...).slice(0, 10), which cut a
  // localized string at a byte count and lost the year ("31 may 202").
  it("keeps the full year in both locales", () => {
    expect(formatDate(now, "es")).toContain("2026");
    expect(formatDate(now, "en")).toContain("2026");
  });

  it("omits the time", () => {
    for (const lang of ["es", "en"] as const) {
      const out = formatDate(now, lang);
      expect(out).not.toMatch(/\d{1,2}:\d{2}/);
    }
  });

  it("stays absolute for recent dates instead of going relative", () => {
    const out = formatDate(ago(5 * MIN), "es");
    expect(out).not.toContain("hace");
    expect(out).toContain("2026");
  });

  it("uses the Santo Domingo day, not the UTC or device day", () => {
    // 02:00Z on June 1 is still May 31 in Santo Domingo.
    const lateEvening = new Date("2026-06-01T02:00:00.000Z");
    expect(norm(formatDate(lateEvening, "es"))).toBe("31 may 2026");
    expect(norm(formatDate(lateEvening, "en"))).toBe("May 31, 2026");
  });
});

describe("formatRecordTime", () => {
  it("shows date, time and the GMT-4 offset in both languages", () => {
    const d = new Date("2026-05-31T19:05:00.000Z");
    expect(norm(formatRecordTime(d, "es"))).toBe("31 may 2026, 15:05 GMT-4");
    expect(norm(formatRecordTime(d, "en"))).toBe("May 31, 2026, 3:05 PM GMT-4");
  });

  it("uses the Santo Domingo day near midnight UTC", () => {
    const d = new Date("2026-06-01T03:30:00.000Z");
    expect(norm(formatRecordTime(d, "es"))).toBe("31 may 2026, 23:30 GMT-4");
  });
});
