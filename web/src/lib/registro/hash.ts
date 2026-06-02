// Server-only module: uses node:crypto and must never be imported into a
// client component. Domain logic for the per-partida hash chain. Reached only
// through server actions (logRegistro) and server-side chain verification.
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
    if (r.ledgerVersion !== 2) return { ok: false, brokenAt: r.id };
    if (r.prevHash !== expectedPrev) return { ok: false, brokenAt: r.id };
    const recomputed = computeHash(r.prevHash, {
      ledgerVersion: r.ledgerVersion, category: r.category, text: r.text, progressPct: r.progressPct,
      authorId: r.authorId, locationId: r.locationId, gpsLat: r.gpsLat, gpsLng: r.gpsLng,
      serverCreatedAt: r.serverCreatedAt, attachments: r.attachments,
    });
    if (recomputed !== r.hash) return { ok: false, brokenAt: r.id };
    expectedPrev = r.hash;
  }
  return { ok: true };
}
