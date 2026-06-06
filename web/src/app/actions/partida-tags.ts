"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { requireProjectStructureAccess } from "@/lib/authz/projects";
import { revalidatePath } from "next/cache";
import type { Role } from "@prisma/client";

function parseTagList(raw: unknown) {
  return [...new Set(
    String(raw ?? "")
      .split(",")
      .map((x) => x.trim().replace(/\s+/g, " "))
      .filter(Boolean),
  )].slice(0, 8);
}

export async function setPartidaTags(formData: FormData) {
  const session = await auth();
  const user = session?.user as { id?: string; companyId?: string; role?: Role } | undefined;
  if (!user?.id || !user.companyId || !user.role) throw new Error("Unauthorized");

  const partidaId = String(formData.get("partidaId"));
  const partida = await prisma.partida.findFirst({
    where: { id: partidaId, deletedAt: null, project: { companyId: user.companyId } },
    select: { id: true, projectId: true },
  });
  if (!partida) throw new Error("Forbidden");
  await requireProjectStructureAccess({ id: user.id, companyId: user.companyId, role: user.role }, partida.projectId);

  const names = parseTagList(formData.get("tags"));
  await prisma.$transaction(async (tx) => {
    await tx.partidaTagOnPartida.deleteMany({ where: { partidaId } });
    for (const name of names) {
      const tag = await tx.partidaTag.upsert({
        where: { projectId_name: { projectId: partida.projectId, name } },
        create: { projectId: partida.projectId, name },
        update: {},
      });
      await tx.partidaTagOnPartida.create({ data: { partidaId, tagId: tag.id } });
    }
  });
  revalidatePath(`/app/projects/${partida.projectId}`);
  revalidatePath(`/app/partidas/${partidaId}`);
}
