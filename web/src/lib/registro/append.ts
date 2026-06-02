import { prisma } from "@/lib/db";
import { computeHash, GENESIS_PREV_HASH } from "./hash";
import { retryOnConflict } from "./retry";
import type { RegistroCategory, AttachmentType } from "@prisma/client";

const LEDGER_VERSION = 2;

export type AppendInput = {
  partidaId: string;
  authorId: string;
  category: RegistroCategory | null;
  text: string | null;
  progressPct: number | null;
  gpsLat: number | null;
  gpsLng: number | null;
  locationId: string | null;
  attachments: { fileType: AttachmentType; url: string; sha256: string }[];
  correctionOfId?: string | null;
};

export async function appendRegistro(input: AppendInput) {
  return retryOnConflict(() =>
    prisma.$transaction(async (tx) => {
      const tip = await tx.registro.findFirst({
        where: { partidaId: input.partidaId },
        orderBy: [{ serverCreatedAt: "desc" }, { id: "desc" }],
      });
      const prevHash = tip ? tip.hash : GENESIS_PREV_HASH;
      const serverCreatedAt = new Date();
      const hash = computeHash(prevHash, {
        ledgerVersion: LEDGER_VERSION, category: input.category, text: input.text,
        progressPct: input.progressPct, authorId: input.authorId, locationId: input.locationId,
        gpsLat: input.gpsLat, gpsLng: input.gpsLng, serverCreatedAt,
        attachments: input.attachments.map((a) => ({ fileType: a.fileType, sha256: a.sha256 })),
      });
      const created = await tx.registro.create({
        data: {
          partidaId: input.partidaId, authorId: input.authorId, category: input.category,
          text: input.text, progressPct: input.progressPct,
          gpsLat: input.gpsLat, gpsLng: input.gpsLng, locationId: input.locationId,
          ledgerVersion: LEDGER_VERSION, serverCreatedAt, prevHash, hash,
          correctionOfId: input.correctionOfId ?? null,
          attachments: {
            create: input.attachments.map((a) => ({ url: a.url, sha256: a.sha256, fileType: a.fileType })),
          },
        },
        include: { attachments: true },
      });
      if (input.progressPct !== null) {
        await tx.partida.update({ where: { id: input.partidaId }, data: { progressPct: input.progressPct } });
      }
      return created;
    }),
  );
}
