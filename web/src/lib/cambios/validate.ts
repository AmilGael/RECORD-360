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

export function parseRejectionReason(raw: unknown): string {
  const v = String(raw ?? "").trim();
  if (v === "") throw new Error("Indica el motivo del rechazo.");
  if (v.length > 1000) throw new Error("El motivo del rechazo es demasiado largo (máx. 1000 caracteres).");
  return v;
}

export function parseReminderDueAt(raw: unknown): Date {
  const v = String(raw ?? "").trim();
  if (v === "") throw new Error("El recordatorio es obligatorio en una solicitud de cambio.");
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new Error("Recordatorio inválido.");
  return d;
}

export function parseResolutionNote(raw: unknown): string {
  const v = String(raw ?? "").trim();
  if (v === "") throw new Error("Escribe el feedback de la resolución.");
  if (v.length > 1000) throw new Error("El feedback es demasiado largo (máx. 1000 caracteres).");
  return v;
}
