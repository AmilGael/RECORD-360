import { createHmac, timingSafeEqual } from "node:crypto";
import type { AttachmentType } from "@prisma/client";
import { contentTypeForKey } from "@/lib/storage/mime";

// Object keys are minted server-side as `${randomUUID()}${ext}` — anything else
// was never issued by our presign route and is rejected before the grant check.
export const GENERATED_KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$/i;

// Direct-to-storage uploads bypass the server, so the finalize action can't
// trust a client-supplied object key on its own: registering an arbitrary key
// would let one tenant claim (and thus read, via /api/media) another tenant's
// object. A grant binds { key, fileType } to the requesting user with an HMAC
// minted at presign time; finalize only accepts keys it provably issued to
// that same user. Stateless on purpose — nothing to clean up if the client
// abandons the upload.

const GRANT_TTL_MS = 15 * 60 * 1000; // matches the presigned URL's own expiry

export type UploadGrant = { key: string; fileType: AttachmentType; exp: number; token: string };

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

export function issueUploadGrant(userId: string, key: string, fileType: AttachmentType, now = Date.now()): UploadGrant {
  const exp = now + GRANT_TTL_MS;
  return { key, fileType, exp, token: sign(`${userId}:${key}:${fileType}:${exp}`) };
}

export function verifyUploadGrant(
  userId: string,
  grant: { key: string; fileType: string; exp: number; token: string },
  now = Date.now(),
): boolean {
  if (!Number.isFinite(grant.exp) || grant.exp < now) return false;
  const expected = Buffer.from(sign(`${userId}:${grant.key}:${grant.fileType}:${grant.exp}`));
  const got = Buffer.from(String(grant.token ?? ""));
  return expected.length === got.length && timingSafeEqual(expected, got);
}

/** Thumbnail grants: generated key, IMAGE type, HMAC for this user. */
export function verifyImageThumbGrant(
  userId: string,
  grant: { key: string; fileType: string; exp: number; token: string },
  now = Date.now(),
): boolean {
  if (grant.fileType !== "IMAGE") return false;
  if (!GENERATED_KEY_RE.test(grant.key)) return false;
  const ct = contentTypeForKey(grant.key);
  if (!ct?.startsWith("image/")) return false;
  return verifyUploadGrant(userId, { key: grant.key, fileType: "IMAGE", exp: grant.exp, token: grant.token }, now);
}
