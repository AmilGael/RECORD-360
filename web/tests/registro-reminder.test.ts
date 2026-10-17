import { describe, expect, it } from "vitest";
import { parseReminderDueAt } from "@/lib/registro/validate";
import { zonedTimestamp } from "@/lib/time/zone";

// An offset-less datetime-local value is wall time in APP_TIME_ZONE (Santo
// Domingo), not on the machine running the test.
function toAppDateTimeInput(date: Date) {
  return zonedTimestamp(date).replace(" ", "T");
}
const floorToMinute = (d: Date) => new Date(Math.floor(d.getTime() / 60_000) * 60_000);

describe("parseReminderDueAt", () => {
  it("accepts empty values", () => {
    expect(parseReminderDueAt(null)).toBeNull();
    expect(parseReminderDueAt("")).toBeNull();
    expect(parseReminderDueAt(undefined)).toBeNull();
  });

  it("accepts future reminder dates", () => {
    const target = new Date(Date.now() + 5 * 60_000);
    const future = toAppDateTimeInput(target);
    const parsed = parseReminderDueAt(future);
    expect(parsed).toBeInstanceOf(Date);
    expect(parsed?.toISOString()).toBe(floorToMinute(target).toISOString());
  });

  it("rejects invalid or past dates", () => {
    expect(() => parseReminderDueAt("not-a-date")).toThrow(/Recordatorio/i);
    const past = toAppDateTimeInput(new Date(Date.now() - 5 * 60_000));
    expect(() => parseReminderDueAt(past)).toThrow(/futura/i);
  });
});
