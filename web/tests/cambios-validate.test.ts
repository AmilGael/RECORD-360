import { describe, it, expect } from "vitest";
import { parseChangeTitle, parseReminderDueAt, parseResolutionNote, parseRequestGps, parseRequestKind, parseRequestSeverity } from "@/lib/cambios/validate";
import { zonedTimestamp } from "@/lib/time/zone";

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
  it("reads an offset-less value (no-JS post) as Santo Domingo wall time", () => {
    expect(parseReminderDueAt("2027-01-15T10:00").toISOString()).toBe("2027-01-15T14:00:00.000Z");
  });
  it("accepts an offset-less 'now + 2 h' in Santo Domingo that a UTC reading would call past", () => {
    const target = new Date(Date.now() + 2 * 3_600_000);
    const wall = zonedTimestamp(target).replace(" ", "T");
    expect(parseReminderDueAt(wall).toISOString()).toBe(new Date(Math.floor(target.getTime() / 60_000) * 60_000).toISOString());
  });
  it("keeps ISO with Z unchanged (what the form sends after client conversion)", () => {
    const iso = new Date(Date.now() + 3_600_000).toISOString();
    expect(parseReminderDueAt(iso).toISOString()).toBe(iso);
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

describe("parseRequestKind", () => {
  it("accepts CHANGE and ALERT", () => {
    expect(parseRequestKind("CHANGE")).toBe("CHANGE");
    expect(parseRequestKind("ALERT")).toBe("ALERT");
  });
  it("is case-insensitive", () => {
    expect(parseRequestKind("change")).toBe("CHANGE");
  });
  it("rejects missing or unknown values — no preselection", () => {
    expect(() => parseRequestKind(null)).toThrow(/tipo/i);
    expect(() => parseRequestKind("")).toThrow(/tipo/i);
    expect(() => parseRequestKind("BOGUS")).toThrow(/tipo/i);
  });
});

describe("parseRequestSeverity", () => {
  it("accepts IMPORTANT and CRITICAL", () => {
    expect(parseRequestSeverity("IMPORTANT")).toBe("IMPORTANT");
    expect(parseRequestSeverity("CRITICAL")).toBe("CRITICAL");
  });
  it("rejects missing or unknown values — no preselection", () => {
    expect(() => parseRequestSeverity(null)).toThrow(/severidad/i);
    expect(() => parseRequestSeverity("")).toThrow(/severidad/i);
    expect(() => parseRequestSeverity("BOGUS")).toThrow(/severidad/i);
  });
});

describe("parseRequestGps", () => {
  it("accepts valid in-range coordinates", () => {
    expect(parseRequestGps("18.4861", "-69.9312")).toEqual({ lat: 18.4861, lng: -69.9312 });
  });
  it("rejects both coordinates missing", () => {
    expect(() => parseRequestGps(null, null)).toThrow(/ubicación|obligatoria/i);
  });
  it("rejects a one-sided coordinate (lat only)", () => {
    expect(() => parseRequestGps("18.4861", null)).toThrow(/ubicación|obligatoria/i);
  });
  it("rejects a one-sided coordinate (lng only)", () => {
    expect(() => parseRequestGps(null, "-69.9312")).toThrow(/ubicación|obligatoria/i);
  });
  it("rejects non-numeric coordinates", () => {
    expect(() => parseRequestGps("abc", "-69.9312")).toThrow(/inválid/i);
  });
  it("rejects out-of-range latitude/longitude", () => {
    expect(() => parseRequestGps("91", "0")).toThrow(/inválid/i);
    expect(() => parseRequestGps("0", "181")).toThrow(/inválid/i);
    expect(() => parseRequestGps("-91", "0")).toThrow(/inválid/i);
    expect(() => parseRequestGps("0", "-181")).toThrow(/inválid/i);
  });
});
