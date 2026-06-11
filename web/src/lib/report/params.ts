/**
 * Shared parameter helpers for deterministic report routes (R2.1).
 * Kept in lib/ so route files export only HTTP handlers (Next.js build
 * constraint: extra exports from route files cause build failures).
 */

/** Parse a from/to date query param. Returns null if absent, "invalid" if not a valid date. */
export function parseRangeParam(url: URL, key: "from" | "to"): Date | null | "invalid" {
  const raw = url.searchParams.get(key);
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? "invalid" : d;
}

/** Sanitize a string for use in a Content-Disposition filename. */
export function sanitizeFilename(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-{2,}/g, "-")
    .slice(0, 80);
}
