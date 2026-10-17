// Field-friendly timestamps: recent entries read as relative time ("hace 5
// min"), older ones as a localized absolute date. Replaces raw ISO/UTC, which
// is unreadable on site. `now` is injectable for deterministic tests.
// Every absolute format pins APP_TIME_ZONE: the server renders in UTC and a
// viewer's device may sit in another zone, so the default zone is never right.

import { APP_TIME_ZONE } from "@/lib/time/zone";

type Lang = "es" | "en";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const intlLocale = (lang: Lang) => (lang === "es" ? "es" : "en");

/**
 * Date without the time, for table columns and list metadata that only carry a
 * day. Always absolute — unlike formatTimestamp, which goes relative for recent
 * entries. Never slice formatTimestamp's output to drop the time: it returns a
 * localized string whose length varies by locale, so a fixed cut truncates the
 * year ("31 may 202", "May 31, 20").
 */
export function formatDate(date: Date, lang: Lang): string {
  return new Intl.DateTimeFormat(intlLocale(lang), {
    dateStyle: "medium",
    timeZone: APP_TIME_ZONE,
  }).format(date);
}

export function formatTimestamp(date: Date, lang: Lang, now: Date = new Date()): string {
  const diff = now.getTime() - date.getTime();

  // Future instants (due dates) have no relative wording here; "ahora" would
  // hide when they fall due.
  if (diff >= 0 && diff < MIN) return lang === "es" ? "ahora" : "now";

  if (diff >= 0 && diff < HOUR) {
    const m = Math.floor(diff / MIN);
    return lang === "es" ? `hace ${m} min` : `${m} min ago`;
  }

  if (diff >= 0 && diff < DAY) {
    const h = Math.floor(diff / HOUR);
    return lang === "es" ? `hace ${h} h` : `${h} h ago`;
  }

  return new Intl.DateTimeFormat(intlLocale(lang), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: APP_TIME_ZONE,
  }).format(date);
}

/**
 * Absolute date and time with the zone offset ("31 may 2026, 15:05 GMT-4"), for
 * times that are part of the record itself — sealing, capture, signatures,
 * conclusion, due dates — where a reader in any zone must know which clock.
 * dateStyle/timeStyle cannot be combined with timeZoneName, hence the fields.
 */
export function formatRecordTime(date: Date, lang: Lang): string {
  return new Intl.DateTimeFormat(intlLocale(lang), {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "shortOffset",
    timeZone: APP_TIME_ZONE,
  }).format(date);
}
