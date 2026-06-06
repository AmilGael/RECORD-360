import { Prisma } from "@prisma/client";

export async function lockPartidaLedger(tx: Prisma.TransactionClient, partidaId: string) {
  await tx.$queryRaw`SELECT 1 FROM "Partida" WHERE id = ${partidaId} FOR UPDATE`;
}
