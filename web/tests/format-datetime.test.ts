import { describe, it, expect } from "vitest";
import { formatDate, formatTimestamp } from "@/lib/format/datetime";

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

  it("falls back to a localized absolute date beyond a day", () => {
    const out = formatTimestamp(ago(3 * DAY), "es", now);
    expect(out).toContain("2026");
    // Not the raw ISO string anymore.
    expect(out).not.toContain("T");
    expect(out).not.toContain("Z");
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
});
