"use server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { parseProgressPct } from "@/lib/registro/validate";
import { requireProjectStructureAccess } from "@/lib/authz/projects";
import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";

export async function updatePartidaProgress(formData: FormData) {
  const session = await auth();
  const user = session?.user as { id?: string; companyId?: string; role?: Role } | undefined;
  if (!user?.id || !user.companyId || !user.role) throw new Error("Unauthorized");

  const partidaId = String(formData.get("partidaId"));
  const progressPct = parseProgressPct(formData.get("progressPct"));
  if (progressPct === null) throw new Error("El avance es obligatorio.");

  const partida = await prisma.partida.findFirst({
    where: { id: partidaId, deletedAt: null, project: { companyId: user.companyId } },
    select: { id: true, projectId: true },
  });
  if (!partida) throw new Error("Forbidden");
  await requireProjectStructureAccess({ id: user.id, companyId: user.companyId, role: user.role }, partida.projectId);

  await prisma.partida.update({ where: { id: partida.id }, data: { progressPct } });
  revalidatePath(`/app/projects/${partida.projectId}`);
  revalidatePath(`/app/partidas/${partida.id}`);
  revalidatePath("/app");
}
