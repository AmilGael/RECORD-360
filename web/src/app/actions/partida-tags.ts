"use server";
import { prisma } from "@/lib/db";
import { requireProjectStructureAccess, projectAccessWhere } from "@/lib/authz/projects";
import { revalidatePath } from "next/cache";
import { requireFreshSession } from "@/lib/auth/session";
import { formResult, type FormError } from "@/lib/errors/form-result";

function parseTagList(raw: unknown) {
  return [...new Set(
    String(raw ?? "")
      .split(",")
      .map((x) => x.trim().replace(/\s+/g, " "))
      .filter(Boolean),
  )].slice(0, 8);
}

export async function setPartidaTags(formData: FormData) {
  const user = await requireFreshSession();

  const partidaId = String(formData.get("partidaId"));
  const partida = await prisma.partida.findFirst({
    where: { id: partidaId, deletedAt: null, project: projectAccessWhere({ id: user.id, companyId: user.companyId, role: user.role }) },
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

export async function setPartidaTagsForm(_prev: FormError | null, formData: FormData): Promise<FormError | null> {
  return formResult("setPartidaTags", () => setPartidaTags(formData));
}
