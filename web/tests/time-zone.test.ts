import { describe, expect, it } from "vitest";
import {
  APP_TIME_ZONE,
  DEFAULT_APP_TIME_ZONE,
  endOfDayUtc,
  parseDayBound,
  parseInstantInput,
  resolveTimeZone,
  startOfDayUtc,
  zonedTimestamp,
  zonedWallTimeToUtc,
} from "@/lib/time/zone";

const iso = (d: Date) => d.toISOString();
const NY = "America/New_York";

describe("APP_TIME_ZONE", () => {
  it("defaults to Santo Domingo", () => {
    expect(DEFAULT_APP_TIME_ZONE).toBe("America/Santo_Domingo");
    expect(APP_TIME_ZONE).toBe(DEFAULT_APP_TIME_ZONE);
  });
  it("keeps a valid IANA zone and falls back on an invalid or empty one", () => {
    expect(resolveTimeZone("Europe/Madrid")).toBe("Europe/Madrid");
    expect(resolveTimeZone("Mars/Olympus_Mons")).toBe(DEFAULT_APP_TIME_ZONE);
    expect(resolveTimeZone("")).toBe(DEFAULT_APP_TIME_ZONE);
    expect(resolveTimeZone(undefined)).toBe(DEFAULT_APP_TIME_ZONE);
  });
});

describe("zonedWallTimeToUtc", () => {
  it("reads wall time in Santo Domingo (UTC-4, no DST) by default", () => {
    expect(iso(zonedWallTimeToUtc("2026-10-16T15:00"))).toBe("2026-10-16T19:00:00.000Z");
    expect(iso(zonedWallTimeToUtc("2026-01-15T23:30:45"))).toBe("2026-01-16T03:30:45.000Z");
  });

  it("reads wall time in Etc/UTC unchanged", () => {
    expect(iso(zonedWallTimeToUtc("2026-10-16T15:00", "Etc/UTC"))).toBe("2026-10-16T15:00:00.000Z");
  });

  it("New York spring forward (2026-03-08): skipped hour shifts forward, either side is exact", () => {
    expect(iso(zonedWallTimeToUtc("2026-03-08T01:30", NY))).toBe("2026-03-08T06:30:00.000Z"); // EST
    expect(iso(zonedWallTimeToUtc("2026-03-08T02:30", NY))).toBe("2026-03-08T07:30:00.000Z"); // = 03:30 EDT
    expect(iso(zonedWallTimeToUtc("2026-03-08T03:30", NY))).toBe("2026-03-08T07:30:00.000Z"); // EDT
  });

  it("New York fall back (2026-11-01): repeated hour takes the earlier instant", () => {
    expect(iso(zonedWallTimeToUtc("2026-11-01T00:30", NY))).toBe("2026-11-01T04:30:00.000Z"); // EDT
    expect(iso(zonedWallTimeToUtc("2026-11-01T01:30", NY))).toBe("2026-11-01T05:30:00.000Z"); // first 01:30, EDT
    expect(iso(zonedWallTimeToUtc("2026-11-01T02:30", NY))).toBe("2026-11-01T07:30:00.000Z"); // EST
  });

  it("rejects malformed input", () => {
    for (const bad of [
      "", "2026-10-16", "2026-10-16T15", "2026-10-16 15:00", "16/10/2026 15:00",
      "2026-10-16T15:00Z", "2026-10-16T15:00-04:00", "2026-10-16T15:00:00.000",
      "2026-02-30T10:00", "2026-13-01T10:00", "2026-10-16T24:00", "2026-10-16T12:60",
    ]) {
      expect(() => zonedWallTimeToUtc(bad), bad).toThrow(RangeError);
    }
  });
});

describe("startOfDayUtc / endOfDayUtc", () => {
  it("Santo Domingo day is 04:00Z to 03:59:59.999Z next day", () => {
    expect(iso(startOfDayUtc("2026-10-16"))).toBe("2026-10-16T04:00:00.000Z");
    expect(iso(endOfDayUtc("2026-10-16"))).toBe("2026-10-17T03:59:59.999Z");
  });

  it("Etc/UTC day is the UTC day", () => {
    expect(iso(startOfDayUtc("2026-10-16", "Etc/UTC"))).toBe("2026-10-16T00:00:00.000Z");
    expect(iso(endOfDayUtc("2026-10-16", "Etc/UTC"))).toBe("2026-10-16T23:59:59.999Z");
  });

  it("New York spring-forward day lasts 23 h", () => {
    const start = startOfDayUtc("2026-03-08", NY);
    const end = endOfDayUtc("2026-03-08", NY);
    expect(iso(start)).toBe("2026-03-08T05:00:00.000Z");
    expect(iso(end)).toBe("2026-03-09T03:59:59.999Z");
    expect(end.getTime() + 1 - start.getTime()).toBe(23 * 3_600_000);
  });

  it("New York fall-back day lasts 25 h", () => {
    const start = startOfDayUtc("2026-11-01", NY);
    const end = endOfDayUtc("2026-11-01", NY);
    expect(iso(start)).toBe("2026-11-01T04:00:00.000Z");
    expect(iso(end)).toBe("2026-11-02T04:59:59.999Z");
    expect(end.getTime() + 1 - start.getTime()).toBe(25 * 3_600_000);
  });

  it("crosses month and year ends", () => {
    expect(iso(endOfDayUtc("2026-12-31"))).toBe("2027-01-01T03:59:59.999Z");
    expect(iso(endOfDayUtc("2028-02-28"))).toBe("2028-02-29T03:59:59.999Z");
  });

  it("rejects malformed input", () => {
    for (const bad of ["", "2026-10-16T00:00", "2026-02-30", "2026-1-5", "16/10/2026"]) {
      expect(() => startOfDayUtc(bad), bad).toThrow(RangeError);
      expect(() => endOfDayUtc(bad), bad).toThrow(RangeError);
    }
  });
});

describe("parseInstantInput", () => {
  it("leaves ISO with Z or an offset unchanged", () => {
    expect(iso(parseInstantInput("2026-10-16T19:00:00.000Z"))).toBe("2026-10-16T19:00:00.000Z");
    expect(iso(parseInstantInput("2026-10-16T15:00:00-04:00"))).toBe("2026-10-16T19:00:00.000Z");
    expect(iso(parseInstantInput("2026-10-16T21:00:00+02:00"))).toBe("2026-10-16T19:00:00.000Z");
  });
  it("reads an offset-less wall time in APP_TIME_ZONE, whatever the process zone", () => {
    expect(iso(parseInstantInput("2026-10-16T15:00"))).toBe("2026-10-16T19:00:00.000Z");
  });
  it("yields an Invalid Date for garbage or impossible dates", () => {
    expect(Number.isNaN(parseInstantInput("not-a-date").getTime())).toBe(true);
    expect(Number.isNaN(parseInstantInput("2026-02-30T10:00").getTime())).toBe(true);
  });
});

describe("parseDayBound", () => {
  it("maps a date-only value to the local day's edges", () => {
    expect(iso(parseDayBound("2026-10-16", "start")!)).toBe("2026-10-16T04:00:00.000Z");
    expect(iso(parseDayBound(" 2026-10-16 ", "end")!)).toBe("2026-10-17T03:59:59.999Z");
  });
  it("ignores anything that is not a valid YYYY-MM-DD", () => {
    expect(parseDayBound(undefined, "start")).toBeUndefined();
    expect(parseDayBound("", "end")).toBeUndefined();
    expect(parseDayBound("banana", "end")).toBeUndefined();
    expect(parseDayBound("2026-10-16T10:00", "start")).toBeUndefined();
    expect(parseDayBound("2026-02-30", "start")).toBeUndefined();
  });
});

describe("zonedTimestamp", () => {
  it("renders the wall time in APP_TIME_ZONE", () => {
    expect(zonedTimestamp(new Date("2026-01-01T00:00:00.000Z"))).toBe("2025-12-31 20:00");
    expect(zonedTimestamp(new Date("2026-01-01T00:00:00.000Z"), "Etc/UTC")).toBe("2026-01-01 00:00");
  });
});
