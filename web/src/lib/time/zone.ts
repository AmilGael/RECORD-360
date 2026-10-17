// The app's wall-clock zone. Stored instants stay UTC; this zone only decides
// how people's typed dates/times are read and how instants are displayed.
// Netlify functions run in UTC and phones can be anywhere, so neither the
// server's nor the device's zone may stand in for it.
// NEXT_PUBLIC_ so the browser bundle agrees with the server; Next inlines it at
// build time, so changing it needs a rebuild.

export const DEFAULT_APP_TIME_ZONE = "America/Santo_Domingo";

/** Returns `tz` when Intl accepts it, otherwise the default zone. */
export function resolveTimeZone(tz: string | undefined | null): string {
  if (!tz) return DEFAULT_APP_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_APP_TIME_ZONE;
  }
}

export const APP_TIME_ZONE = resolveTimeZone(process.env.NEXT_PUBLIC_APP_TIME_ZONE);

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const WALL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const partsFormatters = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = partsFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsFormatters.set(tz, f);
  }
  return f;
}

type Wall = { y: number; mo: number; d: number; h: number; mi: number; s: number };

function wallAt(instant: number, tz: string): Wall {
  const p: Record<string, number> = {};
  for (const { type, value } of partsFormatter(tz).formatToParts(new Date(instant))) {
    if (type !== "literal") p[type] = Number(value);
  }
  return { y: p.year, mo: p.month, d: p.day, h: p.hour, mi: p.minute, s: p.second };
}

function wallAsUtc(w: Wall): number {
  return Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s);
}

/** Zone offset (wall − UTC, ms) at an instant. Seconds are dropped so the
 *  sub-minute LMT offsets of old dates can't skew the result. */
function offsetAt(instant: number, tz: string): number {
  const floored = Math.floor(instant / 1000) * 1000;
  return wallAsUtc(wallAt(floored, tz)) - floored;
}

function wallToUtcMs(w: Wall, tz: string): number {
  const asUtc = wallAsUtc(w);
  // The true offset is one of the offsets in force half a day either side of
  // the naive guess (zones never change twice within 12 h).
  const candidates = [...new Set([offsetAt(asUtc - DAY / 2, tz), offsetAt(asUtc + DAY / 2, tz)])]
    .map((off) => asUtc - off)
    .filter((t) => wallAsUtc(wallAt(t, tz)) === asUtc)
    .sort((a, b) => a - b);
  // Repeated hour (fall back): the earlier instant. Skipped hour (spring
  // forward): shift forward by the gap, using the offset before the change.
  // Same as Temporal's "compatible" disambiguation.
  if (candidates.length > 0) return candidates[0];
  return asUtc - offsetAt(asUtc - DAY / 2, tz);
}

function checkedWall(y: number, mo: number, d: number, h: number, mi: number, s: number): Wall {
  const probe = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  if (
    probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d ||
    probe.getUTCHours() !== h || probe.getUTCMinutes() !== mi || probe.getUTCSeconds() !== s
  ) {
    throw new RangeError("Fecha u hora inválida.");
  }
  return { y, mo, d, h, mi, s };
}

/**
 * The UTC instant of a wall-clock time ("YYYY-MM-DDTHH:mm", optional ":ss", no
 * offset) in `tz`. Throws RangeError on anything else.
 */
export function zonedWallTimeToUtc(wall: string, tz: string = APP_TIME_ZONE): Date {
  const m = WALL_RE.exec(wall);
  if (!m) throw new RangeError("Fecha u hora inválida.");
  const w = checkedWall(+m[1], +m[2], +m[3], +m[4], +m[5], m[6] ? +m[6] : 0);
  return new Date(wallToUtcMs(w, tz));
}

function parseDay(dateStr: string): { y: number; mo: number; d: number } {
  const m = DATE_RE.exec(dateStr);
  if (!m) throw new RangeError("Fecha inválida.");
  const w = checkedWall(+m[1], +m[2], +m[3], 0, 0, 0);
  return { y: w.y, mo: w.mo, d: w.d };
}

/** First instant of the local day "YYYY-MM-DD" in `tz`. */
export function startOfDayUtc(dateStr: string, tz: string = APP_TIME_ZONE): Date {
  const { y, mo, d } = parseDay(dateStr);
  return new Date(wallToUtcMs({ y, mo, d, h: 0, mi: 0, s: 0 }, tz));
}

/** Last millisecond of the local day "YYYY-MM-DD" in `tz` (next local midnight − 1 ms). */
export function endOfDayUtc(dateStr: string, tz: string = APP_TIME_ZONE): Date {
  const { y, mo, d } = parseDay(dateStr);
  const next = new Date(Date.UTC(y, mo - 1, d + 1));
  const nextStart = wallToUtcMs(
    { y: next.getUTCFullYear(), mo: next.getUTCMonth() + 1, d: next.getUTCDate(), h: 0, mi: 0, s: 0 },
    tz,
  );
  return new Date(nextStart - 1);
}

/** True for a date-only "YYYY-MM-DD" string (shape only). */
export function isDateOnly(v: string): boolean {
  return DATE_RE.test(v);
}

/**
 * Server-side parse of a date/time form value. An offset-less wall time is read
 * in `tz` (forms and old offline-queue entries send those); anything else —
 * ISO with Z or an offset — goes to `new Date` unchanged. Garbage yields an
 * Invalid Date for the caller to reject.
 */
export function parseInstantInput(v: string, tz: string = APP_TIME_ZONE): Date {
  if (WALL_RE.test(v)) {
    try {
      return zonedWallTimeToUtc(v, tz);
    } catch {
      return new Date(NaN);
    }
  }
  return new Date(v);
}

/**
 * Parse a date-only filter value to the start or end of that local day in
 * `tz`. Anything that is not a valid "YYYY-MM-DD" yields undefined (the filter
 * is ignored, as before for unparseable values).
 */
export function parseDayBound(raw: unknown, edge: "start" | "end", tz: string = APP_TIME_ZONE): Date | undefined {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!isDateOnly(v)) return undefined;
  try {
    return edge === "start" ? startOfDayUtc(v, tz) : endOfDayUtc(v, tz);
  } catch {
    return undefined;
  }
}

/** "YYYY-MM-DD HH:mm" wall time of an instant in `tz` (machine-style, no label). */
export function zonedTimestamp(date: Date, tz: string = APP_TIME_ZONE): string {
  const w = wallAt(date.getTime(), tz);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${w.y}-${p(w.mo)}-${p(w.d)} ${p(w.h)}:${p(w.mi)}`;
}

/** "YYYY-MM-DD" local date of an instant in `tz`. */
export function zonedDate(date: Date, tz: string = APP_TIME_ZONE): string {
  return zonedTimestamp(date, tz).slice(0, 10);
}
