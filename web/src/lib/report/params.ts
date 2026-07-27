/**
 * Shared parameter helpers for deterministic report routes (R2.1).
 * Kept in lib/ so route files export only HTTP handlers (Next.js build
 * constraint: extra exports from route files cause build failures).
 */

/** Parse a from/to date query param. Returns null if absent, "invalid" if not a valid date.
 * For "to" params with a date-only value (YYYY-MM-DD), the time is set to end-of-day (T23:59:59.999Z).
 */
export function parseRangeParam(url: URL, key: "from" | "to"): Date | null | "invalid" {
  const raw = url.searchParams.get(key);
  if (!raw) return null;
  if (key === "to" && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T23:59:59.999Z`);
  }
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

/**
 * R3 WS11 missing-seal policy (decision, not legally blocking): a PDF export
 * still proceeds without a company seal — a plain header lets a caller/admin
 * notice, since the download itself is a plain <a href> (no client-side fetch
 * to inspect a JSON body). Every report route sets this header when the
 * company has no seal on file / it could not be loaded.
 */
export const SEAL_WARNING_HEADER = "X-Seal-Warning";
export const SEAL_WARNING_MESSAGE = "Sello de la compania no configurado o no disponible; el documento se genero sin sello.";
