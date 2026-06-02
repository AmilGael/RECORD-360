// Server-side validation for registro inputs. The composer constrains these in
// the browser, but the action must not trust client input (devtools, Postman).

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
