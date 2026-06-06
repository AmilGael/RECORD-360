import type { Registro, Attachment } from "@prisma/client";
import type { StoredRegistro } from "./hash";

export function toStored(r: Registro & { attachments: Attachment[] }): StoredRegistro {
  return {
    id: r.id, prevHash: r.prevHash, hash: r.hash,
    ledgerVersion: r.ledgerVersion,
    category: r.category,
    text: r.text,
    progressPct: r.progressPct,
    authorId: r.authorId,
    locationId: r.locationId,
    gpsLat: r.gpsLat === null ? null : Number(r.gpsLat),
    gpsLng: r.gpsLng === null ? null : Number(r.gpsLng),
    serverCreatedAt: r.serverCreatedAt,
    attachments: r.attachments.map((a) => ({ fileType: a.fileType, sha256: a.sha256 })),
  };
}
