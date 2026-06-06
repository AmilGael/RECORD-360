// Server-only. Produces the canonical, deterministic string that feeds the
// tamper-evidence hash. Field set, key order, and per-field formatting are
// pinned so create-time and verify-time hashes match. This is ledger format v2.
import type { RegistroCategory, AttachmentType } from "@prisma/client";

export type AttachmentDigest = { fileType: AttachmentType; sha256: string };

export type RegistroPayload = {
  ledgerVersion: number;
  category: RegistroCategory | null;
  text: string | null;
  progressPct: number | null;
  authorId: string;
  locationId: string | null;
  gpsLat: number | null;
  gpsLng: number | null;
  serverCreatedAt: Date;
  attachments: AttachmentDigest[];
};

export function canonicalPayload(p: RegistroPayload): string {
  const attachments = p.attachments
    .map((a) => ({ fileType: a.fileType, sha256: a.sha256 }))
    .sort((a, b) =>
      a.sha256 !== b.sha256
        ? a.sha256 < b.sha256 ? -1 : 1
        : a.fileType < b.fileType ? -1 : a.fileType > b.fileType ? 1 : 0,
    );

  const obj: Record<string, unknown> = {
    attachments,
    authorId: p.authorId,
    category: p.category,
    gpsLat: p.gpsLat === null ? null : p.gpsLat.toFixed(6),
    gpsLng: p.gpsLng === null ? null : p.gpsLng.toFixed(6),
    ledgerVersion: p.ledgerVersion,
    locationId: p.locationId,
    progressPct: p.progressPct === null ? null : Math.round(p.progressPct),
    serverCreatedAt: p.serverCreatedAt.toISOString(),
    text: p.text,
  };
  const ordered: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) ordered[k] = obj[k];
  return JSON.stringify(ordered);
}
