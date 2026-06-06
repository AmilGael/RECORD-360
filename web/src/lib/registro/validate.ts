// Server-side validation for registro inputs. The composer constrains these in
// the browser, but the action must not trust client input (devtools, Postman).

import { RegistroCategory } from "@prisma/client";

/**
 * Parse and validate a progress-percentage form value.
 * Empty/missing → null. Otherwise must be an integer in [0, 100]; anything else
 * throws so the action rejects the request rather than storing bad data.
 */
export function parseProgressPct(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 100) {
    throw new Error("El avance debe ser un número entero entre 0 y 100.");
  }
  return n;
}

/** Parse an optional location label. Empty/whitespace → null; otherwise trimmed,
 *  bounded to 200 chars (rejects tampered/oversized input). */
export function parseLocation(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const v = String(raw).trim();
  if (v === "") return null;
  if (v.length > 200) {
    throw new Error("La ubicación es demasiado larga (máx. 200 caracteres).");
  }
  return v;
}

const VALID_CATEGORIES = new Set<string>(Object.values(RegistroCategory));

/** Parse an optional category form value. Empty → null; a valid enum member →
 *  it; anything else throws so the action rejects tampered input. */
export function parseCategory(raw: unknown): RegistroCategory | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const v = String(raw);
  if (!VALID_CATEGORIES.has(v)) {
    throw new Error("Categoría inválida.");
  }
  return v as RegistroCategory;
}

/** Parse an optional segment (folder) name. Empty/whitespace → null; otherwise
 *  trimmed with internal whitespace collapsed, bounded to 80 chars. */
export function parseSegment(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const v = String(raw).trim().replace(/\s+/g, " ");
  if (v === "") return null;
  if (v.length > 80) {
    throw new Error("El nombre del bloque es demasiado largo (máx. 80 caracteres).");
  }
  return v;
}
