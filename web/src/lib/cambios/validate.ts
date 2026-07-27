// Server-side validation for cambio (change-request) inputs. The form
// constrains these in the browser, but the action must not trust client input.
import type { RequestKind, RequestSeverity } from "@prisma/client";

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


export function parseReminderDueAt(raw: unknown): Date {
  const v = String(raw ?? "").trim();
  if (v === "") throw new Error("El recordatorio es obligatorio en una solicitud de cambio.");
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new Error("Recordatorio inválido.");
  if (d.getTime() < Date.now() - 60_000) throw new Error("El recordatorio debe ser una fecha futura.");
  return d;
}

export function parseResolutionNote(raw: unknown): string {
  const v = String(raw ?? "").trim();
  if (v === "") throw new Error("Escribe el feedback de la resolución.");
  if (v.length > 1000) throw new Error("El feedback es demasiado largo (máx. 1000 caracteres).");
  return v;
}

/**
 * Parse the request kind (WS5). The form requires an explicit choice — no
 * preselection — so anything other than the two valid literals is rejected.
 * Message mirrors dictionary key `requests.kindRequired`.
 */
export function parseRequestKind(raw: unknown): RequestKind {
  const v = String(raw ?? "").trim().toUpperCase();
  if (v !== "CHANGE" && v !== "ALERT") throw new Error("Selecciona el tipo de solicitud.");
  return v as RequestKind;
}

/**
 * Parse the request severity (WS5). No default preselection — the DB
 * @default(IMPORTANT) only backfills legacy rows, the form must choose.
 * Message mirrors dictionary key `requests.severityRequired`.
 */
export function parseRequestSeverity(raw: unknown): RequestSeverity {
  const v = String(raw ?? "").trim().toUpperCase();
  if (v !== "IMPORTANT" && v !== "CRITICAL") throw new Error("Selecciona la severidad.");
  return v as RequestSeverity;
}

/**
 * Parse + validate GPS coordinates for a NEW request (WS5/WS6 §6). Both
 * coordinates are mandatory — one-sided (only lat or only lng) is rejected
 * the same as fully missing. Values must be finite and within range.
 * Messages mirror dictionary keys `requests.gpsRequired` (missing/one-sided)
 * and `requests.gpsInvalid` (present but not a valid coordinate).
 */
export function parseRequestGps(latRaw: unknown, lngRaw: unknown): { lat: number; lng: number } {
  const latStr = String(latRaw ?? "").trim();
  const lngStr = String(lngRaw ?? "").trim();
  if (!latStr || !lngStr) throw new Error("La ubicación GPS es obligatoria para crear una solicitud.");
  const lat = Number(latStr);
  const lng = Number(lngStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error("Coordenadas GPS inválidas.");
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) throw new Error("Coordenadas GPS inválidas.");
  return { lat, lng };
}
