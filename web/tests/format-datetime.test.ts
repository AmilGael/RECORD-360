import { describe, it, expect } from "vitest";
import { formatTimestamp } from "@/lib/format/datetime";

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
