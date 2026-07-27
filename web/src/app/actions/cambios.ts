"use server";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { NotificationSeverity, Role } from "@prisma/client";
import { parseChangeTitle, parseReminderDueAt, parseResolutionNote, parseRequestGps, parseRequestKind, parseRequestSeverity } from "@/lib/cambios/validate";
import { computeChangeSeal } from "@/lib/cambios/seal";
import { prepareAttachments } from "@/lib/registro/upload";
import { storage } from "@/lib/storage";
import { appendRegistroTx } from "@/lib/registro/append";
import { retryOnConflict } from "@/lib/registro/retry";
import { projectAccessWhere } from "@/lib/authz/projects";
import { notifyEvent, resolveRecipients } from "@/lib/notifications/events";
import { requireFreshSession } from "@/lib/auth/session";

const KIND_LABEL = { CHANGE: "Solicitud de cambio", ALERT: "Alerta" } as const;
const SEVERITY_TO_NOTIFICATION: Record<"IMPORTANT" | "CRITICAL", NotificationSeverity> = {
  IMPORTANT: NotificationSeverity.IMPORTANT,
  CRITICAL: NotificationSeverity.CRITICAL,
};

export type CreateChangeRequestState = { status: "idle" | "success" | "error"; message?: string };

// Phase A finding (WS5): this used to be a plain `(formData) => Promise<void>`
// server action wired to `<form action={...}>` and threw plain Errors on
// validation failure. Next.js masks a thrown server-action error in
// production (only an opaque digest reaches the client) — so every
// validation message written in lib/cambios/validate.ts was invisible to
// real users, who just saw the form silently fail. Converting to the
// useActionState `(prevState, formData) => state` shape (same convention as
// requestAccess in app/actions/access.ts) and catching everything internally
// means the message always reaches the client via rendered state, in dev AND
// prod.
export async function createChangeRequest(_prev: CreateChangeRequestState, formData: FormData): Promise<CreateChangeRequestState> {
  try {
    const user = await requireFreshSession();

    const projectId = String(formData.get("projectId"));
    const project = await prisma.project.findFirst({ where: { id: projectId, ...projectAccessWhere({ id: user.id, companyId: user.companyId, role: user.role }) } });
    if (!project) throw new Error("Forbidden");

    const kind = parseRequestKind(formData.get("kind"));
    const severity = parseRequestSeverity(formData.get("severity"));
    const title = parseChangeTitle(formData.get("title"));
    const description = (String(formData.get("description") ?? "").trim()) || null;
    const reminderDueAt = parseReminderDueAt(formData.get("reminderDueAt"));
    const { lat: gpsLat, lng: gpsLng } = parseRequestGps(formData.get("gpsLat"), formData.get("gpsLng"));

    const segmentIds = [...new Set(formData.getAll("segmentIds").map(String).filter(Boolean))];
    if (segmentIds.length === 0) throw new Error("Selecciona al menos un bloque afectado.");
    const validSegments = await prisma.segment.findMany({ where: { id: { in: segmentIds }, projectId }, select: { id: true } });
    if (validSegments.length !== segmentIds.length) throw new Error("Bloque inválido.");

    const photos = formData.getAll("evidence").filter((f): f is File => f instanceof File);
    const prepared = await prepareAttachments(photos, storage);

    const created = await retryOnConflict(() => prisma.$transaction(async (tx) => {
      const count = await tx.changeRequest.count({ where: { projectId } });
      return tx.changeRequest.create({
        data: {
          projectId, code: `SC-${count + 1}`, kind, severity, title, description, reminderDueAt, costImpact: null, daysImpact: null,
          authorId: user.id!, gpsLat, gpsLng,
          segments: { create: segmentIds.map((id) => ({ segmentId: id })) },
          attachments: { create: prepared.map((a) => ({ url: a.url, sha256: a.sha256, fileType: a.fileType })) },
        },
      });
    }));

    await notifyEvent({
      key: kind === "ALERT" ? "alert.created" : "request.created",
      companyId: user.companyId,
      actorId: user.id,
      projectId,
      severity: SEVERITY_TO_NOTIFICATION[severity],
      title: `${KIND_LABEL[kind]} ${created.code}: ${title}`,
      link: `/app/projects/${projectId}/cambios/${created.id}`,
    });

    revalidatePath(`/app/projects/${projectId}`);
    return { status: "success" };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "No se pudo crear la solicitud." };
  }
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

  // WS5: the author must ALWAYS hear about the resolution of their own
  // request, even if a later reassignment dropped them from the project's
  // default stakeholder policy — so they're unioned in explicitly rather
  // than relying solely on resolveRecipients' project-assignment branch.
  const eventKey = action === "INTEGRATE" ? "request.resolved" : "request.rejected";
  const title = `${KIND_LABEL[cr.kind]} ${cr.code} ${action === "INTEGRATE" ? "integrada" : "rechazada"}`;
  const stakeholders = await resolveRecipients({
    key: eventKey, companyId: user.companyId, actorId: user.id, projectId: cr.projectId, title,
  });
  const recipientIds = [...new Set([cr.authorId, ...stakeholders])];
  await notifyEvent({
    key: eventKey,
    companyId: user.companyId,
    actorId: user.id,
    projectId: cr.projectId,
    title,
    body: `${cr.title} — ${resolutionNote}`,
    link: `/app/projects/${cr.projectId}/cambios/${cr.id}`,
    recipientIds,
  });
  revalidatePath(`/app/projects/${cr.projectId}`);
  revalidatePath(`/app/projects/${cr.projectId}/cambios/${cr.id}`);
}
