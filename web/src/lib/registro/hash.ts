import { createHash } from "node:crypto";
import { canonicalPayload, type RegistroPayload } from "./canonical";

export const GENESIS_PREV_HASH = "0".repeat(64);

export function computeHash(prevHash: string, payload: RegistroPayload): string {
  return createHash("sha256").update(prevHash + canonicalPayload(payload)).digest("hex");
}

export type StoredRegistro = RegistroPayload & {
  id: string;
  prevHash: string;
  hash: string;
};

export function verifyChain(registros: StoredRegistro[]): { ok: boolean; brokenAt?: string } {
  let expectedPrev = GENESIS_PREV_HASH;
  for (const r of registros) {
    if (r.prevHash !== expectedPrev) return { ok: false, brokenAt: r.id };
    const recomputed = computeHash(r.prevHash, {
      type: r.type, text: r.text, mediaUrl: r.mediaUrl, progressPct: r.progressPct,
      authorId: r.authorId, gpsLat: r.gpsLat, gpsLng: r.gpsLng, serverCreatedAt: r.serverCreatedAt,
    });
    if (recomputed !== r.hash) return { ok: false, brokenAt: r.id };
    expectedPrev = r.hash;
  }
  return { ok: true };
}
