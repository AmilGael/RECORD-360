import type { Registro } from "@prisma/client";
import type { StoredRegistro } from "./hash";

export function toStored(r: Registro): StoredRegistro {
  return {
    id: r.id, prevHash: r.prevHash, hash: r.hash,
    type: r.type, text: r.text, mediaUrl: r.mediaUrl, progressPct: r.progressPct,
    authorId: r.authorId,
    gpsLat: r.gpsLat === null ? null : Number(r.gpsLat),
    gpsLng: r.gpsLng === null ? null : Number(r.gpsLng),
    serverCreatedAt: r.serverCreatedAt,
  };
}
