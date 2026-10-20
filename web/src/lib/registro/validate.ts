// Server-side validation for registro inputs. The composer constrains these in
// the browser, but the action must not trust client input (devtools, Postman).

import { RegistroCategory } from "@prisma/client";
import { parseInstantInput } from "@/lib/time/zone";
import { UserError } from "@/lib/errors/user-error";

/**
 * Parse and validate a progress-percentage form value.
 * Empty/missing → null. Otherwise must be an integer in [0, 100]; anything else
 * throws so the action rejects the request rather than storing bad data.
 */
export function parseProgressPct(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 100) {
    throw new UserError("progressRange");
  }
  return n;
}

/** Parse an optional reminder timestamp. Empty → null; otherwise the date must
 * exist and be in the future. An offset-less "YYYY-MM-DDTHH:mm" is a wall time
 * in APP_TIME_ZONE (see parseInstantInput); ISO with an offset is taken as is (with a small skew buffer for offline capture).
 * This is the ONLINE path's rule — it stays strict. Offline captures that were
 * valid at the moment they were taken go through parseOfflineReminderDueAt
 * instead (see R3 WS10 contracts §5). */
export function parseReminderDueAt(raw: unknown): Date | null {
  if (raw === null || raw === undefined) return null;
  const v = String(raw).trim();
  if (v === "") return null;
  const d = parseInstantInput(v);
  if (Number.isNaN(d.getTime())) {
    throw new UserError("reminderInvalid");
  }
  if (d.getTime() < Date.now() - 60 * 1000) {
    throw new UserError("reminderFuture");
  }
  return d;
}

/**
 * Parse a reminder timestamp coming from the offline sync route. An offline
 * capture can sit in the device's queue past its own reminder time before it
 * ever reaches the server — that is expected, not an error. The rule (R3 WS10
 * contracts §5): accept a `reminderDueAt` that is now in the past PROVIDED it
 * was valid at the moment of capture, i.e. `reminderDueAt >= clientCapturedAt -
 * 60s`. The synced registro is then simply an already-overdue reminder (it
 * will show up in the pending queue as overdue) — this does NOT relax the
 * online path (`parseReminderDueAt` above), which still requires a future date
 * relative to "now".
 */
export function parseOfflineReminderDueAt(raw: unknown, clientCapturedAt: Date | null): Date | null {
  if (raw === null || raw === undefined) return null;
  const v = String(raw).trim();
  if (v === "") return null;
  const d = parseInstantInput(v);
  if (Number.isNaN(d.getTime())) {
    throw new UserError("reminderInvalid");
  }
  const SKEW_MS = 60 * 1000;
  if (clientCapturedAt && !Number.isNaN(clientCapturedAt.getTime())) {
    if (d.getTime() >= clientCapturedAt.getTime() - SKEW_MS) return d;
    throw new UserError("reminderFuture");
  }
  // No (valid) clientCapturedAt to anchor against — fall back to the strict
  // online rule so a malformed/omitted capture time can't be used to sneak an
  // arbitrarily old reminder past validation.
  if (d.getTime() < Date.now() - SKEW_MS) {
    throw new UserError("reminderFuture");
  }
  return d;
}

/** Parse an optional location label. Empty/whitespace → null; otherwise trimmed,
 *  bounded to 200 chars (rejects tampered/oversized input). */
export function parseLocation(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const v = String(raw).trim();
  if (v === "") return null;
  if (v.length > 200) {
    throw new UserError("locationTooLong");
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
    throw new UserError("categoryInvalid");
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
    throw new UserError("blockNameTooLong");
  }
  return v;
}
