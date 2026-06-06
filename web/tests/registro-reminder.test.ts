import { describe, expect, it } from "vitest";
import { parseReminderDueAt } from "@/lib/registro/validate";

function toLocalDateTimeInput(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

describe("parseReminderDueAt", () => {
  it("accepts empty values", () => {
    expect(parseReminderDueAt(null)).toBeNull();
    expect(parseReminderDueAt("")).toBeNull();
    expect(parseReminderDueAt(undefined)).toBeNull();
  });

  it("accepts future reminder dates", () => {
    const future = toLocalDateTimeInput(new Date(Date.now() + 5 * 60_000));
    const parsed = parseReminderDueAt(future);
    expect(parsed).toBeInstanceOf(Date);
    expect(parsed?.toISOString()).toBe(new Date(future).toISOString());
  });

  it("rejects invalid or past dates", () => {
    expect(() => parseReminderDueAt("not-a-date")).toThrow(/Recordatorio/i);
    const past = toLocalDateTimeInput(new Date(Date.now() - 5 * 60_000));
    expect(() => parseReminderDueAt(past)).toThrow(/futura/i);
  });
});
