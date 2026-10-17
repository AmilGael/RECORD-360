/**
 * Shared parameter helpers for deterministic report routes (R2.1).
 * Kept in lib/ so route files export only HTTP handlers (Next.js build
 * constraint: extra exports from route files cause build failures).
 */

import { endOfDayUtc, isDateOnly, startOfDayUtc } from "@/lib/time/zone";

/** Parse a from/to date query param. Returns null if absent, "invalid" if not a valid date.
 * A date-only value (YYYY-MM-DD) is the whole local day in APP_TIME_ZONE:
 * "from" starts at local midnight, "to" ends at the next local midnight − 1 ms.
 * Ending "to" at 23:59:59.999Z dropped that evening's registros (after 20:00 in
 * Santo Domingo) from legal reports. Full ISO values are used as given.
 */
export function parseRangeParam(url: URL, key: "from" | "to"): Date | null | "invalid" {
  const raw = url.searchParams.get(key);
  if (!raw) return null;
  return parseRangeValue(raw, key);
}

/** Shared by the report routes and the informe action (see parseRangeParam). */
export function parseRangeValue(raw: string, key: "from" | "to"): Date | "invalid" {
  if (isDateOnly(raw)) {
    try {
      return key === "from" ? startOfDayUtc(raw) : endOfDayUtc(raw);
    } catch {
      return "invalid";
    }
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

export const SEAL_WARNING_HEADER = "X-Seal-Warning";
export const SEAL_WARNING_MESSAGE = "Configura un sello de la compania valido antes de exportar el documento.";

/** Production invariant: an exported PDF may never be emitted without its seal. */
export function missingSealResponse(): Response {
  return new Response(SEAL_WARNING_MESSAGE, {
    status: 409,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      [SEAL_WARNING_HEADER]: SEAL_WARNING_MESSAGE,
    },
  });
}
