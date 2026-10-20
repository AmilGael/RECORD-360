/** Canonical form of an email for lookups, throttle keys and storage. */
export function normalizeEmail(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase();
}
