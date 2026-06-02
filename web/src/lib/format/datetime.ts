// Field-friendly timestamps: recent entries read as relative time ("hace 5
// min"), older ones as a localized absolute date. Replaces raw ISO/UTC, which
// is unreadable on site. `now` is injectable for deterministic tests.

type Lang = "es" | "en";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export function formatTimestamp(date: Date, lang: Lang, now: Date = new Date()): string {
  const diff = now.getTime() - date.getTime();

  if (diff < MIN) return lang === "es" ? "ahora" : "now";

  if (diff < HOUR) {
    const m = Math.floor(diff / MIN);
    return lang === "es" ? `hace ${m} min` : `${m} min ago`;
  }

  if (diff < DAY) {
    const h = Math.floor(diff / HOUR);
    return lang === "es" ? `hace ${h} h` : `${h} h ago`;
  }

  return new Intl.DateTimeFormat(lang === "es" ? "es" : "en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
