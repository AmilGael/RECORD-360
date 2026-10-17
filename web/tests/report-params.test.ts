import { describe, expect, it } from "vitest";
import { parseRangeParam } from "@/lib/report/params";

function url(qs: string): URL {
  return new URL(`http://test/${qs}`);
}

describe("parseRangeParam", () => {
  it("'to' with a date-only value ends at the last ms of that day in Santo Domingo", () => {
    const result = parseRangeParam(url("?to=2026-02-28"), "to");
    expect(result).toBeInstanceOf(Date);
    expect((result as Date).toISOString()).toBe("2026-03-01T03:59:59.999Z");
  });

  it("'from' with a date-only value starts at local midnight in Santo Domingo", () => {
    const result = parseRangeParam(url("?from=2026-02-01"), "from");
    expect(result).toBeInstanceOf(Date);
    expect((result as Date).toISOString()).toBe("2026-02-01T04:00:00.000Z");
  });

  it("returns 'invalid' for an impossible date-only value", () => {
    expect(parseRangeParam(url("?to=2026-02-30"), "to")).toBe("invalid");
  });

  it("returns null when the key is absent", () => {
    expect(parseRangeParam(url("?"), "to")).toBeNull();
    expect(parseRangeParam(url("?"), "from")).toBeNull();
  });

  it("returns 'invalid' for a non-date string", () => {
    expect(parseRangeParam(url("?to=not-a-date"), "to")).toBe("invalid");
    expect(parseRangeParam(url("?from=banana"), "from")).toBe("invalid");
  });

  it("passes through a full datetime string unchanged for 'to'", () => {
    const iso = "2026-02-28T15:30:00.000Z";
    const result = parseRangeParam(url(`?to=${iso}`), "to");
    expect(result).toBeInstanceOf(Date);
    expect((result as Date).toISOString()).toBe(iso);
  });
});
