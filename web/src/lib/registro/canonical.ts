// Server-only. Produces the canonical, deterministic string that feeds the
// tamper-evidence hash. Field set, key order, and per-field formatting are
// pinned (see the M1 design spec) so create-time and verify-time hashes match.
export type RegistroPayload = {
  type: "NOTE" | "PHOTO" | null;
  text: string | null;
  mediaUrl: string | null;
  progressPct: number | null;
  authorId: string;
  gpsLat: number | null;
  gpsLng: number | null;
  serverCreatedAt: Date;
};

export function canonicalPayload(p: RegistroPayload): string {
  const obj: Record<string, string | number | null> = {
    authorId: p.authorId,
    gpsLat: p.gpsLat === null ? null : p.gpsLat.toFixed(6),
    gpsLng: p.gpsLng === null ? null : p.gpsLng.toFixed(6),
    mediaUrl: p.mediaUrl,
    progressPct: p.progressPct === null ? null : Math.round(p.progressPct),
    serverCreatedAt: p.serverCreatedAt.toISOString(),
    text: p.text,
    type: p.type,
  };
  const ordered: Record<string, string | number | null> = {};
  for (const k of Object.keys(obj).sort()) ordered[k] = obj[k];
  return JSON.stringify(ordered);
}
