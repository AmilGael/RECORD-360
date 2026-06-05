"use server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";

async function requireManager() {
  const session = await auth();
  const user = session?.user as { id?: string; companyId?: string; role?: Role } | undefined;
  if (!user?.id || !user.companyId || !user.role) throw new Error("Unauthorized");
  if (user.role !== Role.ADMIN && user.role !== Role.MANAGER) throw new Error("Forbidden");
  return { id: user.id, companyId: user.companyId, role: user.role };
}

async function ownedPartida(partidaId: string, companyId: string) {
  const p = await prisma.partida.findFirst({
    where: { id: partidaId, project: { companyId } },
    select: { id: true, projectId: true },
  });
  if (!p) throw new Error("Forbidden");
  return p;
}

export async function deletePartida(formData: FormData) {
  const { id: uid, companyId } = await requireManager();
  const p = await ownedPartida(String(formData.get("partidaId")), companyId);
  await prisma.partida.update({ where: { id: p.id }, data: { deletedAt: new Date(), deletedById: uid } });
  revalidatePath(`/app/projects/${p.projectId}`);
}

export async function restorePartida(formData: FormData) {
  const { companyId } = await requireManager();
  const p = await ownedPartida(String(formData.get("partidaId")), companyId);
  await prisma.partida.update({ where: { id: p.id }, data: { deletedAt: null, deletedById: null } });
  revalidatePath(`/app/projects/${p.projectId}`);
}

export async function purgePartida(formData: FormData) {
  const { role, companyId } = await requireManager();
  if (role !== Role.ADMIN) throw new Error("Forbidden");
  const p = await ownedPartida(String(formData.get("partidaId")), companyId);
  const records = await prisma.registro.count({ where: { partidaId: p.id } });
  if (records > 0) throw new Error("No se puede borrar definitivamente: contiene registros inalterables.");
  await prisma.$transaction([
    prisma.changeRequestPartida.deleteMany({ where: { partidaId: p.id } }),
    prisma.partida.delete({ where: { id: p.id } }),
  ]);
  revalidatePath(`/app/projects/${p.projectId}`);
}
