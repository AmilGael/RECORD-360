// Server-side validation for cambio (change-request) inputs. The form
// constrains these in the browser, but the action must not trust client input.

/**
 * Parse and validate a change-request title.
 * Empty/whitespace → throws. Otherwise trimmed and returned; rejects strings
 * over 200 characters.
 */
export function parseChangeTitle(raw: unknown): string {
  const v = String(raw ?? "").trim();
  if (v === "") throw new Error("El título es obligatorio.");
  if (v.length > 200) throw new Error("El título es demasiado largo (máx. 200 caracteres).");
  return v;
}

/**
 * Parse an optional cost-impact value for a Decimal field.
 * Empty/missing → null. Otherwise must be a finite number; returns a
 * normalised numeric string. Negatives allowed (a change can reduce cost).
 */
export function parseCostImpact(raw: unknown): string | null {
  if (raw === null || raw === undefined || String(raw).trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error("El impacto en costo debe ser numérico.");
  return String(n);
}

/**
 * Parse an optional days-impact value.
 * Empty/missing → null. Otherwise must be an integer; returns a number.
 * Negatives allowed (a change can reduce the schedule).
 */
export function parseDaysImpact(raw: unknown): number | null {
  if (raw === null || raw === undefined || String(raw).trim() === "") return null;
  const n = Number(raw);
  if (!Number.isInteger(n)) throw new Error("El impacto en tiempo debe ser un número entero de días.");
  return n;
}

export function parseRejectionReason(raw: unknown): string {
  const v = String(raw ?? "").trim();
  if (v === "") throw new Error("Indica el motivo del rechazo.");
  if (v.length > 1000) throw new Error("El motivo del rechazo es demasiado largo (máx. 1000 caracteres).");
  return v;
}
