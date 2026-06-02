import { prisma } from "@/lib/db";
import { computeHash, GENESIS_PREV_HASH } from "./hash";
import { retryOnConflict } from "./retry";
import type { RegistroType } from "@prisma/client";

export type AppendInput = {
  partidaId: string;
  authorId: string;
  type: RegistroType;
  text: string | null;
  mediaUrl: string | null;
  progressPct: number | null;
  gpsLat: number | null;
  gpsLng: number | null;
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
      type: input.type, text: input.text, mediaUrl: input.mediaUrl, progressPct: input.progressPct,
      authorId: input.authorId, gpsLat: input.gpsLat, gpsLng: input.gpsLng, serverCreatedAt,
    });
    const created = await tx.registro.create({
      data: {
        partidaId: input.partidaId, authorId: input.authorId, type: input.type,
        text: input.text, mediaUrl: input.mediaUrl, progressPct: input.progressPct,
        gpsLat: input.gpsLat, gpsLng: input.gpsLng, serverCreatedAt, prevHash, hash,
        correctionOfId: input.correctionOfId ?? null,
      },
    });
    if (input.progressPct !== null) {
      await tx.partida.update({ where: { id: input.partidaId }, data: { progressPct: input.progressPct } });
    }
    return created;
    }),
  );
}
