"use server";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { parseChangeTitle, parseReminderDueAt, parseResolutionNote } from "@/lib/cambios/validate";
import { computeChangeSeal } from "@/lib/cambios/seal";
import { prepareAttachments } from "@/lib/registro/upload";
import { storage } from "@/lib/storage";
import { appendRegistroTx } from "@/lib/registro/append";
import { retryOnConflict } from "@/lib/registro/retry";
import { projectAccessWhere } from "@/lib/authz/projects";
import { createNotifications } from "@/lib/notifications/create";
import { requireFreshSession } from "@/lib/auth/session";

export async function createChangeRequest(formData: FormData) {
  const user = await requireFreshSession();

  const projectId = String(formData.get("projectId"));
  const project = await prisma.project.findFirst({ where: { id: projectId, ...projectAccessWhere({ id: user.id, companyId: user.companyId, role: user.role }) } });
  if (!project) throw new Error("Forbidden");

  const title = parseChangeTitle(formData.get("title"));
  const description = (String(formData.get("description") ?? "").trim()) || null;
  const reminderDueAt = parseReminderDueAt(formData.get("reminderDueAt"));

  const segmentIds = [...new Set(formData.getAll("segmentIds").map(String).filter(Boolean))];
  if (segmentIds.length === 0) throw new Error("Selecciona al menos un bloque afectado.");
  const validSegments = await prisma.segment.findMany({ where: { id: { in: segmentIds }, projectId }, select: { id: true } });
  if (validSegments.length !== segmentIds.length) throw new Error("Bloque inválido.");

  const latRaw = formData.get("gpsLat"); const lngRaw = formData.get("gpsLng");
  const gpsLat = latRaw ? Number(latRaw) : null;
  const gpsLng = lngRaw ? Number(lngRaw) : null;

  const photos = formData.getAll("evidence").filter((f): f is File => f instanceof File);
  const prepared = await prepareAttachments(photos, storage);

  const created = await retryOnConflict(() => prisma.$transaction(async (tx) => {
    const count = await tx.changeRequest.count({ where: { projectId } });
    return tx.changeRequest.create({
      data: {
        projectId, code: `SC-${count + 1}`, title, description, reminderDueAt, costImpact: null, daysImpact: null,
        authorId: user.id!, gpsLat, gpsLng,
        segments: { create: segmentIds.map((id) => ({ segmentId: id })) },
        attachments: { create: prepared.map((a) => ({ url: a.url, sha256: a.sha256, fileType: a.fileType })) },
      },
    });
  }));
  const recipients = await prisma.user.findMany({
    where: {
      companyId: user.companyId,
      role: { in: [Role.ADMIN, Role.MANAGER] },
      id: { not: user.id },
    },
    select: { id: true, companyId: true },
  });
  await createNotifications(recipients.map((r) => ({
    companyId: r.companyId,
    userId: r.id,
    type: "cambio.created",
    title: `Nueva solicitud de cambio ${created.code}`,
    body: title,
    link: `/app/projects/${projectId}/cambios/${created.id}`,
  })));
  revalidatePath(`/app/projects/${projectId}`);
}

export async function resolveChangeRequest(formData: FormData) {
  const user = await requireFreshSession();
  if (user.role !== Role.ADMIN && user.role !== Role.MANAGER) throw new Error("Forbidden");

  const crId = String(formData.get("changeRequestId"));
  const action = String(formData.get("action"));
  if (action !== "INTEGRATE" && action !== "REJECT") throw new Error("Acción inválida.");

  const cr = await prisma.changeRequest.findFirst({
    where: { id: crId, project: { companyId: user.companyId } },
    include: { partidas: { select: { partidaId: true } }, segments: { select: { segmentId: true } } },
  });
  if (!cr) throw new Error("Forbidden");
  if (cr.status !== "OPEN") throw new Error("La solicitud ya fue resuelta.");
  // 4-eyes when possible: a MANAGER cannot close their own solicitud. ADMIN may
  // (small companies often have a single admin who also files requests).
  if (user.role !== Role.ADMIN && cr.authorId === user.id) throw new Error("No puedes resolver tu propia solicitud.");

  const resolutionNote = parseResolutionNote(formData.get("resolutionNote"));

  const resolvedAt = new Date();
  if (action === "REJECT") {
    await prisma.changeRequest.update({ where: { id: cr.id }, data: { status: "REJECTED", resolvedById: user.id, resolvedAt, rejectionReason: resolutionNote, resolutionNote } });
  } else if (action === "INTEGRATE") {
    const segmentIds = cr.segments.map((s) => s.segmentId);
    const markerPartidas = segmentIds.length
      ? await prisma.partida.findMany({
        where: { projectId: cr.projectId, segmentId: { in: segmentIds }, deletedAt: null },
        select: { id: true },
        orderBy: { createdAt: "asc" },
      })
      : cr.partidas.map((p) => ({ id: p.partidaId }));
    const markerPartidaIds = markerPartidas.map((p) => p.id);
    const seal = computeChangeSeal({
      code: cr.code, title: cr.title, description: cr.description,
      costImpact: null,
      daysImpact: null, partidaIds: markerPartidaIds,
      authorId: cr.authorId, resolvedById: user.id, resolvedAt,
    });
    const markerText = `Solicitud de cambio ${cr.code} integrada: ${cr.title}`;
    await retryOnConflict(() => prisma.$transaction(async (tx) => {
      await tx.changeRequest.update({ where: { id: cr.id }, data: { status: "INTEGRATED", resolvedById: user.id!, resolvedAt, seal, resolutionNote } });
      if (segmentIds.length && markerPartidaIds.length) {
        await tx.changeRequestPartida.createMany({
          data: markerPartidaIds.map((partidaId) => ({ changeRequestId: cr.id, partidaId })),
          skipDuplicates: true,
        });
      }
      for (const partidaId of markerPartidaIds) {
        await appendRegistroTx(tx, {
          partidaId, authorId: user.id!, category: null, text: markerText,
          progressPct: null, gpsLat: null, gpsLng: null, locationId: null,
          attachments: [], changeRequestId: cr.id,
        });
      }
    }));
    // The integration appended markers to each affected partida — refresh them.
    for (const partidaId of markerPartidaIds) {
      revalidatePath(`/app/partidas/${partidaId}`);
    }
  } else {
    throw new Error("Acción inválida.");
  }
  await createNotifications([{
    companyId: user.companyId,
    userId: cr.authorId,
    type: "cambio.resolved",
    title: `Solicitud ${cr.code} ${action === "INTEGRATE" ? "integrada" : "rechazada"}`,
    body: `${cr.title} — ${resolutionNote}`,
    link: `/app/projects/${cr.projectId}/cambios/${cr.id}`,
  }]);
  revalidatePath(`/app/projects/${cr.projectId}`);
  revalidatePath(`/app/projects/${cr.projectId}/cambios/${cr.id}`);
}
