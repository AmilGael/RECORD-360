"use server";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { writeAudit } from "@/lib/audit/log";
import { requireFreshSession } from "@/lib/auth/session";
import { createNotifications } from "@/lib/notifications/create";

async function requireSession() {
  const user = await requireFreshSession();
  return { id: user.id, companyId: user.companyId, role: user.role };
}

async function ownedPartida(partidaId: string, companyId: string) {
  const p = await prisma.partida.findFirst({
    where: { id: partidaId, project: { companyId } },
    select: { id: true, projectId: true, name: true },
  });
  if (!p) throw new Error("Forbidden");
  return p;
}

export async function deletePartida(formData: FormData) {
  const { id: uid, companyId, role } = await requireSession();
  const p = await ownedPartida(String(formData.get("partidaId")), companyId);
  if (role !== Role.ADMIN) throw new Error("Forbidden");
  const deletedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.partida.update({ where: { id: p.id }, data: { deletedAt, deletedById: uid } });
    await writeAudit(tx, {
      companyId,
      actorId: uid,
      action: "partida.delete",
      targetType: "Partida",
      targetId: p.id,
      summary: `Partida enviada a reciclaje: ${p.name}`,
      metadata: { projectId: p.projectId, deletedAt: deletedAt.toISOString() },
    });
  });
  revalidatePath(`/app/projects/${p.projectId}`);
  revalidatePath(`/app/partidas/${p.id}`);
  revalidatePath("/app");
}

export async function restorePartida(formData: FormData) {
  const { id: uid, companyId, role } = await requireSession();
  const p = await ownedPartida(String(formData.get("partidaId")), companyId);
  if (role !== Role.ADMIN) throw new Error("Forbidden");
  await prisma.$transaction(async (tx) => {
    await tx.partida.update({ where: { id: p.id }, data: { deletedAt: null, deletedById: null } });
    await writeAudit(tx, {
      companyId,
      actorId: uid,
      action: "partida.restore",
      targetType: "Partida",
      targetId: p.id,
      summary: `Partida restaurada: ${p.name}`,
      metadata: { projectId: p.projectId },
    });
  });
  revalidatePath(`/app/projects/${p.projectId}`);
  revalidatePath(`/app/partidas/${p.id}`);
  revalidatePath("/app");
}

export async function purgePartida(formData: FormData) {
  const { id: uid, role, companyId } = await requireSession();
  if (role !== Role.ADMIN) throw new Error("Forbidden");
  const p = await ownedPartida(String(formData.get("partidaId")), companyId);
  const records = await prisma.registro.count({ where: { partidaId: p.id } });
  if (records > 0) throw new Error("No se puede borrar definitivamente: contiene registros inalterables.");

  const [staff, assignments, actor] = await Promise.all([
    prisma.user.findMany({ where: { companyId, role: { in: [Role.ADMIN, Role.MANAGER] }, disabledAt: null }, select: { id: true } }),
    prisma.projectAssignment.findMany({ where: { projectId: p.projectId }, select: { userId: true } }),
    prisma.user.findFirst({ where: { id: uid }, select: { name: true } }),
  ]);
  const recipientIds = [...new Set([...staff.map((u) => u.id), ...assignments.map((a) => a.userId)])].filter((rid) => rid !== uid);

  await prisma.$transaction(async (tx) => {
    await tx.changeRequestPartida.deleteMany({ where: { partidaId: p.id } });
    await tx.partida.delete({ where: { id: p.id } });
    await writeAudit(tx, {
      companyId,
      actorId: uid,
      action: "partida.purge",
      targetType: "Partida",
      targetId: p.id,
      summary: `Partida borrada definitivamente: ${p.name}`,
      metadata: { projectId: p.projectId },
    });
  });
  revalidatePath(`/app/projects/${p.projectId}`);
  revalidatePath(`/app/partidas/${p.id}`);
  revalidatePath("/app");
  await createNotifications(recipientIds.map((userId) => ({
    companyId,
    userId,
    type: "delete.permanent",
    title: `Partida borrada definitivamente: ${p.name}`,
    body: `Borrada por ${actor?.name ?? "—"}.`,
  })));
}
