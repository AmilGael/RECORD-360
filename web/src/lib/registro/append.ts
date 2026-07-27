import { prisma } from "@/lib/db";
import { computeHash, GENESIS_PREV_HASH } from "./hash";
import { retryOnConflict } from "./retry";
import type { RegistroCategory, AttachmentType } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { lockPartidaLedger } from "./ledger-lock";

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
  replyToId?: string | null;
  reminderDueAt?: Date | null;
  changeRequestId?: string | null;
  idempotencyKey?: string | null;
  clientCapturedAt?: Date | null;
};

export async function appendRegistroTx(tx: Prisma.TransactionClient, input: AppendInput) {
  await lockPartidaLedger(tx, input.partidaId);
  const tip = await tx.registro.findFirst({
    where: { partidaId: input.partidaId },
    orderBy: [{ serverCreatedAt: "desc" }, { id: "desc" }],
  });
  const prevHash = tip ? tip.hash : GENESIS_PREV_HASH;
  const serverCreatedAt = new Date();
  // LEDGER CONTRACT: relational back-pointers (correctionOfId, replyToId, changeRequestId)
  // and offline-capture metadata (idempotencyKey, clientCapturedAt) are metadata,
  // NOT ledger content — they MUST stay out of this hash payload.
  // Adding them would change every recomputed hash and break verifyChain for all
  // existing records.
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
      replyToId: input.replyToId ?? null,
      reminderDueAt: input.reminderDueAt ?? null,
      changeRequestId: input.changeRequestId ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      clientCapturedAt: input.clientCapturedAt ?? null,
      attachments: {
        create: input.attachments.map((a) => ({ url: a.url, sha256: a.sha256, fileType: a.fileType })),
      },
    },
    include: { attachments: true },
  });
  if (input.progressPct !== null) {
    // Lifecycle invariant (WS8, R3 remediation): a registro-driven progress write
    // is a manual write, same as updatePartidaProgress — it caps at 99 (100 is
    // only reachable via Conclude, actions/lifecycle.ts) and never touches a
    // concluded partida's progress. The registro row itself keeps the raw
    // progressPct the caller sent (historical ledger data, unaffected by this
    // cap) — only the derived Partida.progressPct write is constrained.
    const current = await tx.partida.findUnique({ where: { id: input.partidaId }, select: { completedAt: true } });
    if (!current?.completedAt) {
      await tx.partida.update({ where: { id: input.partidaId }, data: { progressPct: Math.min(input.progressPct, 99) } });
    }
  }
  return created;
}

export async function appendRegistro(input: AppendInput) {
  return retryOnConflict(() => prisma.$transaction((tx) => appendRegistroTx(tx, input)));
}
