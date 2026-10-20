import { zonedDate, zonedWallTimeToUtc } from "@/lib/time/zone";

const DAY = 86_400_000;

const pad = (n: number) => String(n).padStart(2, "0");

/** Shift a calendar date (YYYY-MM-DD) by whole days on the UTC calendar. */
export function addUtcCalendarDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Monday (YYYY-MM-DD) of the ISO week that contains `ymd`. */
export function mondayDateOf(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addUtcCalendarDays(ymd, -((dow + 6) % 7));
}

/** 12 Monday keys, oldest first: the week of `now` in `zone` and the 11 before it. */
export function weekStartKeys(now: Date, zone: string): string[] {
  const thisMonday = mondayDateOf(zonedDate(now, zone));
  const keys: string[] = [];
  for (let i = 11; i >= 0; i--) keys.push(addUtcCalendarDays(thisMonday, -7 * i));
  return keys;
}

/** UTC instant of local Monday 00:00 of the oldest of the 12 weeks. */
export function oldestWeekStartUtc(now: Date, zone: string): Date {
  const oldest = weekStartKeys(now, zone)[0];
  return zonedWallTimeToUtc(`${oldest}T00:00:00`, zone);
}

/**
 * Whole calendar days between two instants in `zone`. Same local day is 0.
 * Subtracts Date.UTC(y, m-1, d) values — never the instants themselves.
 */
export function calendarDaysOpen(createdAt: Date, now: Date, zone: string): number {
  const [y1, m1, d1] = zonedDate(createdAt, zone).split("-").map(Number);
  const [y2, m2, d2] = zonedDate(now, zone).split("-").map(Number);
  return (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / DAY;
}

/**
 * Short day+month of a Monday key. timeZone UTC against Date.UTC parts so the
 * label cannot shift with the viewer's or session's zone. es "8 mar", en "Mar 8".
 */
export function formatWeekLabel(weekKey: string, lang: "es" | "en"): string {
  const [y, m, d] = weekKey.split("-").map(Number);
  return new Intl.DateTimeFormat(lang === "es" ? "es" : "en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}
