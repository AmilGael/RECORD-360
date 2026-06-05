"use server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { parseChangeTitle, parseCostImpact, parseDaysImpact } from "@/lib/cambios/validate";
import { computeChangeSeal } from "@/lib/cambios/seal";
import { prepareAttachments } from "@/lib/registro/upload";
import { storage } from "@/lib/storage";
import { appendRegistroTx } from "@/lib/registro/append";
import { retryOnConflict } from "@/lib/registro/retry";
import { projectAccessWhere } from "@/lib/authz/projects";

export async function createChangeRequest(formData: FormData) {
  const session = await auth();
  const user = session?.user as { id?: string; companyId?: string; role?: Role } | undefined;
  if (!user?.id || !user.companyId || !user.role) throw new Error("Unauthorized");

  const projectId = String(formData.get("projectId"));
  const project = await prisma.project.findFirst({ where: { id: projectId, ...projectAccessWhere({ id: user.id, companyId: user.companyId, role: user.role }) } });
  if (!project) throw new Error("Forbidden");

  const title = parseChangeTitle(formData.get("title"));
  const description = (String(formData.get("description") ?? "").trim()) || null;
  const costImpact = parseCostImpact(formData.get("costImpact"));
  const daysImpact = parseDaysImpact(formData.get("daysImpact"));

  const partidaIds = [...new Set(formData.getAll("partidaIds").map(String).filter(Boolean))];
  if (partidaIds.length === 0) throw new Error("Selecciona al menos una partida afectada.");
  const valid = await prisma.partida.findMany({ where: { id: { in: partidaIds }, projectId, deletedAt: null }, select: { id: true } });
  if (valid.length !== partidaIds.length) throw new Error("Partida inválida.");

  const latRaw = formData.get("gpsLat"); const lngRaw = formData.get("gpsLng");
  const gpsLat = latRaw ? Number(latRaw) : null;
  const gpsLng = lngRaw ? Number(lngRaw) : null;

  const photos = formData.getAll("evidence").filter((f): f is File => f instanceof File);
  const prepared = await prepareAttachments(photos, storage);

  await retryOnConflict(() => prisma.$transaction(async (tx) => {
    const count = await tx.changeRequest.count({ where: { projectId } });
    await tx.changeRequest.create({
      data: {
        projectId, code: `SC-${count + 1}`, title, description, costImpact, daysImpact,
        authorId: user.id!, gpsLat, gpsLng,
        partidas: { create: partidaIds.map((id) => ({ partidaId: id })) },
        attachments: { create: prepared.map((a) => ({ url: a.url, sha256: a.sha256, fileType: a.fileType })) },
      },
    });
  }));
  revalidatePath(`/app/projects/${projectId}`);
}

export async function resolveChangeRequest(formData: FormData) {
  const session = await auth();
  const user = session?.user as { id?: string; companyId?: string; role?: Role } | undefined;
  if (!user?.id || !user.companyId || !user.role) throw new Error("Unauthorized");
  if (user.role !== Role.ADMIN && user.role !== Role.MANAGER) throw new Error("Forbidden");

  const crId = String(formData.get("changeRequestId"));
  const action = String(formData.get("action"));
  if (action !== "INTEGRATE" && action !== "REJECT") throw new Error("Acción inválida.");

  const cr = await prisma.changeRequest.findFirst({
    where: { id: crId, project: { companyId: user.companyId } },
    include: { partidas: { select: { partidaId: true } } },
  });
  if (!cr) throw new Error("Forbidden");
  if (cr.status !== "OPEN") throw new Error("La solicitud ya fue resuelta.");
  if (cr.authorId === user.id) throw new Error("No puedes resolver tu propia solicitud.");

  const resolvedAt = new Date();
  if (action === "REJECT") {
    await prisma.changeRequest.update({ where: { id: cr.id }, data: { status: "REJECTED", resolvedById: user.id, resolvedAt } });
  } else if (action === "INTEGRATE") {
    const seal = computeChangeSeal({
      code: cr.code, title: cr.title, description: cr.description,
      costImpact: cr.costImpact ? cr.costImpact.toString() : null,
      daysImpact: cr.daysImpact, partidaIds: cr.partidas.map((p) => p.partidaId),
      authorId: cr.authorId, resolvedById: user.id, resolvedAt,
    });
    const markerText = `Cambio ${cr.code} integrado` +
      (cr.costImpact ? ` · RD$${cr.costImpact.toString()}` : "") +
      (cr.daysImpact != null ? ` · ${cr.daysImpact}d` : "");
    await retryOnConflict(() => prisma.$transaction(async (tx) => {
      await tx.changeRequest.update({ where: { id: cr.id }, data: { status: "INTEGRATED", resolvedById: user.id!, resolvedAt, seal } });
      for (const { partidaId } of cr.partidas) {
        await appendRegistroTx(tx, {
          partidaId, authorId: user.id!, category: null, text: markerText,
          progressPct: null, gpsLat: null, gpsLng: null, locationId: null,
          attachments: [], changeRequestId: cr.id,
        });
      }
    }));
  } else {
    throw new Error("Acción inválida.");
  }
  revalidatePath(`/app/projects/${cr.projectId}`);
  revalidatePath(`/app/projects/${cr.projectId}/cambios/${cr.id}`);
}
