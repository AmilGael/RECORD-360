import { describe, expect, it } from "vitest";
import { formatPeriodDate } from "@/lib/format/period";
import { endOfDayUtc, startOfDayUtc } from "@/lib/time/zone";

describe("formatPeriodDate", () => {
  it("prints legacy UTC-marker rows as the date the user picked", () => {
    // Stored before bounds followed APP_TIME_ZONE: from = 00:00:00.000Z, to = 23:59:59.999Z.
    expect(formatPeriodDate(new Date("2026-02-01T00:00:00.000Z"))).toBe("2026-02-01");
    expect(formatPeriodDate(new Date("2026-02-28T23:59:59.999Z"))).toBe("2026-02-28");
  });

  it("prints new Santo Domingo day bounds as the picked dates", () => {
    expect(formatPeriodDate(startOfDayUtc("2026-02-01"))).toBe("2026-02-01");
    expect(formatPeriodDate(endOfDayUtc("2026-02-28"))).toBe("2026-02-28");
  });

  it("prints any other instant as its Santo Domingo date", () => {
    // 02:30Z on Mar 1 is still Feb 28 in Santo Domingo.
    expect(formatPeriodDate(new Date("2026-03-01T02:30:00.000Z"))).toBe("2026-02-28");
  });

  it("agrees with both rules when the app zone is UTC", () => {
    const from = startOfDayUtc("2026-02-01", "Etc/UTC");
    const to = endOfDayUtc("2026-02-28", "Etc/UTC");
    // New UTC bounds are exactly the legacy markers, so either rule prints the same date.
    expect(from.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(to.toISOString()).toBe("2026-02-28T23:59:59.999Z");
    expect(formatPeriodDate(from, "Etc/UTC")).toBe("2026-02-01");
    expect(formatPeriodDate(to, "Etc/UTC")).toBe("2026-02-28");
    expect(formatPeriodDate(new Date("2026-02-15T13:45:00.000Z"), "Etc/UTC")).toBe("2026-02-15");
  });
});
