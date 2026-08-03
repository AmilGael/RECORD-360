"use server";
// Partida/Segment lifecycle actions (R3 WS8/WS4C). See docs/superpowers/specs/
// 2026-07-27-r3-shared-contracts.md §4 for the state-machine contract this
// follows: completedAt/closedAt == null means open; conclude/close are the
// ONLY paths to progressPct 100 / a closed block; reopen restores the prior
// state. All four actions are idempotent — calling them again on a partida/
// segment already in the target state is a stable no-op (no duplicate audit
// or notification).
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireFreshSession, type FreshSessionUser } from "@/lib/auth/session";
import { requireProjectStructureAccess, projectAccessWhere } from "@/lib/authz/projects";
import { writeAudit } from "@/lib/audit/log";
import { notifyEvent } from "@/lib/notifications/events";

// The sidebar's pending/unread badges are rendered by app/app/layout.tsx, which
// is shared by every /app route. revalidatePath("/app") defaults to type
// "page" and only invalidates the /app *page* — the layout instance rendered
// under /app/partidas/[id] keeps its stale count, which is exactly where the
// user is standing when they conclude a partida. Type "layout" invalidates the
// layout and the whole nested subtree, so the badge is recomputed wherever the
// action was fired from.
function revalidateAppShell() {
  revalidatePath("/app", "layout");
}

function revalidatePartidaPaths(projectId: string, partidaId: string) {
  revalidatePath(`/app/projects/${projectId}`);
  revalidatePath(`/app/partidas/${partidaId}`);
  revalidatePath("/app/pending");
  revalidateAppShell();
}

function revalidateSegmentPaths(projectId: string) {
  revalidatePath(`/app/projects/${projectId}`);
  revalidatePath("/app/pending");
  revalidateAppShell();
}

async function loadOwnedPartida(user: FreshSessionUser, partidaId: string) {
  const partida = await prisma.partida.findFirst({
    where: { id: partidaId, deletedAt: null, project: projectAccessWhere(user) },
    select: {
      id: true,
      projectId: true,
      name: true,
      progressPct: true,
      completedAt: true,
      priorProgressPct: true,
      project: { select: { archivedAt: true } },
      segment: { select: { closedAt: true } },
    },
  });
  if (!partida) throw new Error("Forbidden");
  await requireProjectStructureAccess(user, partida.projectId);
  return partida;
}

export async function concludePartida(formData: FormData) {
  const user = await requireFreshSession();
  const partidaId = String(formData.get("partidaId"));
  const partida = await loadOwnedPartida(user, partidaId);
  if (partida.project.archivedAt) throw new Error("La obra está archivada.");

  if (partida.completedAt) return; // idempotent fast path: already concluded

  // Atomic guarded update: the WHERE clause is re-evaluated against the latest
  // committed row under the row lock, so of two concurrent concludes exactly
  // one matches (count 1); the loser matches 0 rows and skips audit +
  // notification entirely — idempotency does not depend on the pre-tx read.
  // Raw SQL because priorProgressPct must copy the pre-update progressPct in
  // the same statement (updateMany cannot reference the current column value).
  const didChange = await prisma.$transaction(async (tx) => {
    const count = await tx.$executeRaw`
      UPDATE "Partida"
      SET "priorProgressPct" = "progressPct", "progressPct" = 100,
          "completedAt" = NOW(), "completedById" = ${user.id}
      WHERE "id" = ${partida.id} AND "completedAt" IS NULL AND "deletedAt" IS NULL`;
    if (count === 0) return false;
    const after = await tx.partida.findUniqueOrThrow({ where: { id: partida.id }, select: { priorProgressPct: true } });
    await writeAudit(tx, {
      companyId: user.companyId,
      actorId: user.id,
      action: "partida.completed",
      targetType: "Partida",
      targetId: partida.id,
      summary: `Partida concluida: ${partida.name}`,
      metadata: { projectId: partida.projectId, priorProgressPct: after.priorProgressPct },
    });
    return true;
  });
  if (!didChange) return; // lost the race: the other invocation already concluded

  await notifyEvent({
    key: "partida.completed",
    companyId: user.companyId,
    actorId: user.id,
    // Lifecycle transitions are confirmations the actor should see in their own
    // inbox (same policy as partida.created / block.created), not just an
    // announcement to other stakeholders.
    includeActor: true,
    projectId: partida.projectId,
    title: `Partida concluida: ${partida.name}`,
    link: `/app/partidas/${partida.id}`,
  });

  revalidatePartidaPaths(partida.projectId, partida.id);
}

export async function reopenPartida(formData: FormData) {
  const user = await requireFreshSession();
  const partidaId = String(formData.get("partidaId"));
  const partida = await loadOwnedPartida(user, partidaId);
  if (partida.project.archivedAt) throw new Error("La obra está archivada.");

  if (!partida.completedAt) return; // idempotent fast path: already open

  if (partida.segment?.closedAt) {
    throw new Error("El bloque está cerrado: reábrelo antes de reabrir la partida.");
  }

  // Atomic guarded update (see concludePartida): only the invocation whose
  // UPDATE actually flips completedAt writes audit + notification. Restores
  // the progress the partida had before it was concluded, capped at 99 (100 is
  // only reachable via Conclude again); priorProgressPct is left in place on
  // the row for the audit trail — the next Conclude overwrites it.
  const restoredPct = await prisma.$transaction(async (tx) => {
    const count = await tx.$executeRaw`
      UPDATE "Partida"
      SET "completedAt" = NULL, "completedById" = NULL,
          "progressPct" = LEAST(COALESCE("priorProgressPct", 99), 99)
      WHERE "id" = ${partida.id} AND "completedAt" IS NOT NULL AND "deletedAt" IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM "Segment" s
          WHERE s."id" = "Partida"."segmentId" AND s."closedAt" IS NOT NULL
        )`;
    if (count === 0) return null;
    const after = await tx.partida.findUniqueOrThrow({ where: { id: partida.id }, select: { progressPct: true } });
    await writeAudit(tx, {
      companyId: user.companyId,
      actorId: user.id,
      action: "partida.reopened",
      targetType: "Partida",
      targetId: partida.id,
      summary: `Partida reabierta: ${partida.name}`,
      metadata: { projectId: partida.projectId, restoredPct: after.progressPct },
    });
    return after.progressPct;
  });
  if (restoredPct === null) return; // lost the race: already reopened

  await notifyEvent({
    key: "partida.reopened",
    companyId: user.companyId,
    actorId: user.id,
    includeActor: true,
    projectId: partida.projectId,
    title: `Partida reabierta: ${partida.name}`,
    link: `/app/partidas/${partida.id}`,
  });

  revalidatePartidaPaths(partida.projectId, partida.id);
}

async function loadOwnedSegment(user: FreshSessionUser, segmentId: string) {
  const segment = await prisma.segment.findFirst({
    where: { id: segmentId, project: projectAccessWhere(user) },
    select: { id: true, projectId: true, name: true, closedAt: true, project: { select: { archivedAt: true } } },
  });
  if (!segment) throw new Error("Forbidden");
  // Symmetric lifecycle gating (WS8): every lifecycle transition — not just
  // conclude — is rejected while the obra is archived.
  if (segment.project.archivedAt) throw new Error("La obra está archivada.");
  await requireProjectStructureAccess(user, segment.projectId);
  return segment;
}

function isSerializationConflict(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2034";
}

// closeSegment's open-partida check must be atomic against a concurrent
// partida being created/concluded in the same block, so the transaction runs
// SERIALIZABLE. Postgres aborts the losing side of a genuine conflict with
// P2034 — retrying re-reads and re-checks rather than surfacing a spurious
// failure to the user (same shape as retryOnConflict in lib/registro/retry.ts,
// which handles a different error code for a different race).
async function serializable<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>, maxAttempts = 4): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await prisma.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (err) {
      if (!isSerializationConflict(err)) throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}

export async function closeSegment(formData: FormData) {
  const user = await requireFreshSession();
  const segmentId = String(formData.get("segmentId"));
  const segment = await loadOwnedSegment(user, segmentId);

  if (segment.closedAt) return; // idempotent fast path: already closed

  const didChange = await serializable(async (tx) => {
    // Empty block MAY close (documented decision, §4).
    const openCount = await tx.partida.count({
      where: { segmentId: segment.id, deletedAt: null, completedAt: null },
    });
    if (openCount > 0) {
      throw new Error("No se puede cerrar el bloque: hay partidas sin concluir.");
    }
    // Guarded update: after a P2034 retry (or a plain concurrent close) the
    // winner may already have closed the segment — count 0 means this
    // invocation changed nothing and must not write audit or notify.
    const res = await tx.segment.updateMany({
      where: { id: segment.id, closedAt: null },
      data: { closedAt: new Date(), closedById: user.id },
    });
    if (res.count === 0) return false;
    await writeAudit(tx, {
      companyId: user.companyId,
      actorId: user.id,
      action: "segment.closed",
      targetType: "Segment",
      targetId: segment.id,
      summary: `Bloque cerrado: ${segment.name}`,
      metadata: { projectId: segment.projectId },
    });
    return true;
  });
  if (!didChange) return; // lost the race: already closed

  await notifyEvent({
    key: "block.closed",
    companyId: user.companyId,
    actorId: user.id,
    includeActor: true,
    projectId: segment.projectId,
    title: `Bloque cerrado: ${segment.name}`,
    link: `/app/projects/${segment.projectId}`,
  });

  revalidateSegmentPaths(segment.projectId);
}

export async function reopenSegment(formData: FormData) {
  const user = await requireFreshSession();
  const segmentId = String(formData.get("segmentId"));
  const segment = await loadOwnedSegment(user, segmentId);

  if (!segment.closedAt) return; // idempotent fast path: already open

  const didChange = await prisma.$transaction(async (tx) => {
    // Guarded update (see concludePartida): only the invocation that actually
    // flips closedAt writes audit + notification.
    const res = await tx.segment.updateMany({
      where: { id: segment.id, closedAt: { not: null } },
      data: { closedAt: null, closedById: null },
    });
    if (res.count === 0) return false;
    await writeAudit(tx, {
      companyId: user.companyId,
      actorId: user.id,
      action: "segment.reopened",
      targetType: "Segment",
      targetId: segment.id,
      summary: `Bloque reabierto: ${segment.name}`,
      metadata: { projectId: segment.projectId },
    });
    return true;
  });
  if (!didChange) return; // lost the race: already reopened

  await notifyEvent({
    key: "block.reopened",
    companyId: user.companyId,
    actorId: user.id,
    includeActor: true,
    projectId: segment.projectId,
    title: `Bloque reabierto: ${segment.name}`,
    link: `/app/projects/${segment.projectId}`,
  });

  revalidateSegmentPaths(segment.projectId);
}
