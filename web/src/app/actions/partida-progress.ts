"use server";
import { prisma } from "@/lib/db";
import { parseProgressPct } from "@/lib/registro/validate";
import { requireProjectStructureAccess, projectAccessWhere } from "@/lib/authz/projects";
import { revalidatePath } from "next/cache";
import { requireFreshSession } from "@/lib/auth/session";

export async function updatePartidaProgress(formData: FormData) {
  const user = await requireFreshSession();

  const partidaId = String(formData.get("partidaId"));
  const progressPct = parseProgressPct(formData.get("progressPct"));
  if (progressPct === null) throw new Error("El avance es obligatorio.");
  // Lifecycle invariant (WS8): manual progress writes cap at 99 — reaching 100
  // requires Conclude (see actions/lifecycle.ts). parseProgressPct itself stays
  // 0-100 because historical registro data may carry a 100.
  if (progressPct > 99) {
    throw new Error("El avance manual debe ser un entero entre 0 y 99. Usa «Concluir partida» para llegar a 100.");
  }

  const partida = await prisma.partida.findFirst({
    where: { id: partidaId, deletedAt: null, project: projectAccessWhere({ id: user.id, companyId: user.companyId, role: user.role }) },
    select: { id: true, projectId: true, completedAt: true },
  });
  if (!partida) throw new Error("Forbidden");
  if (partida.completedAt) {
    throw new Error("La partida está concluida: reábrela antes de editar el avance manualmente.");
  }
  await requireProjectStructureAccess({ id: user.id, companyId: user.companyId, role: user.role }, partida.projectId);

  await prisma.partida.update({ where: { id: partida.id }, data: { progressPct } });
  revalidatePath(`/app/projects/${partida.projectId}`);
  revalidatePath(`/app/partidas/${partida.id}`);
  revalidatePath("/app");
}
