// Server-side validation for cambio (change-request) inputs. The form
// constrains these in the browser, but the action must not trust client input.
import type { RequestKind, RequestSeverity } from "@prisma/client";
import { parseInstantInput } from "@/lib/time/zone";
import { UserError } from "@/lib/errors/user-error";

/**
 * Parse and validate a change-request title.
 * Empty/whitespace → throws. Otherwise trimmed and returned; rejects strings
 * over 200 characters.
 */
export function parseChangeTitle(raw: unknown): string {
  const v = String(raw ?? "").trim();
  if (v === "") throw new UserError("titleRequired");
  if (v.length > 200) throw new UserError("titleTooLong");
  return v;
}

/** Required reminder. ISO with an offset is taken as is; an offset-less
 *  datetime-local value (no-JS form post) is a wall time in APP_TIME_ZONE. */
export function parseReminderDueAt(raw: unknown): Date {
  const v = String(raw ?? "").trim();
  if (v === "") throw new UserError("reminderRequiredChange");
  const d = parseInstantInput(v);
  if (Number.isNaN(d.getTime())) throw new UserError("reminderInvalid");
  if (d.getTime() < Date.now() - 60_000) throw new UserError("reminderFuture");
  return d;
}

export function parseResolutionNote(raw: unknown): string {
  const v = String(raw ?? "").trim();
  if (v === "") throw new UserError("resolutionRequired");
  if (v.length > 1000) throw new UserError("resolutionTooLong");
  return v;
}

/**
 * Parse the request kind (WS5). The form requires an explicit choice — no
 * preselection — so anything other than the two valid literals is rejected.
 * Message mirrors dictionary key `requests.kindRequired`.
 */
export function parseRequestKind(raw: unknown): RequestKind {
  const v = String(raw ?? "").trim().toUpperCase();
  if (v !== "CHANGE" && v !== "ALERT") throw new UserError("kindRequired");
  return v as RequestKind;
}

/**
 * Parse the request severity (WS5). No default preselection — the DB
 * @default(IMPORTANT) only backfills legacy rows, the form must choose.
 * Message mirrors dictionary key `requests.severityRequired`.
 */
export function parseRequestSeverity(raw: unknown): RequestSeverity {
  const v = String(raw ?? "").trim().toUpperCase();
  if (v !== "IMPORTANT" && v !== "CRITICAL") throw new UserError("severityRequired");
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
  if (!latStr || !lngStr) throw new UserError("gpsRequired");
  const lat = Number(latStr);
  const lng = Number(lngStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new UserError("gpsInvalid");
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) throw new UserError("gpsInvalid");
  return { lat, lng };
}
