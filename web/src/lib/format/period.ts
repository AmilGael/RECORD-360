import { APP_TIME_ZONE, zonedDate } from "@/lib/time/zone";

/**
 * "YYYY-MM-DD" for a report period bound (PDF "Periodo", informe PERIODO).
 * Rows stored before bounds followed APP_TIME_ZONE carry UTC markers —
 * exactly 00:00:00.000Z for "from" and 23:59:59.999Z for "to" — and their UTC
 * date is the day the user picked. Everything else is a local-day bound (or a
 * full instant) and prints as its date in `tz`.
 */
export function formatPeriodDate(d: Date, tz: string = APP_TIME_ZONE): string {
  const iso = d.toISOString();
  if (iso.endsWith("T00:00:00.000Z") || iso.endsWith("T23:59:59.999Z")) return iso.slice(0, 10);
  return zonedDate(d, tz);
}
