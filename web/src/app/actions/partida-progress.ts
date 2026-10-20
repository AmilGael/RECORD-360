"use server";
import { prisma } from "@/lib/db";
import { parseProgressPct } from "@/lib/registro/validate";
import { requireProjectStructureAccess, projectAccessWhere } from "@/lib/authz/projects";
import { revalidatePath } from "next/cache";
import { requireFreshSession } from "@/lib/auth/session";
import { UserError } from "@/lib/errors/user-error";
import { formResult, type FormError } from "@/lib/errors/form-result";

export async function updatePartidaProgress(formData: FormData) {
  const user = await requireFreshSession();

  const partidaId = String(formData.get("partidaId"));
  const progressPct = parseProgressPct(formData.get("progressPct"));
  if (progressPct === null) throw new UserError("progressRequired");
  // Lifecycle invariant (WS8): manual progress writes cap at 99 — reaching 100
  // requires Conclude (see actions/lifecycle.ts). parseProgressPct itself stays
  // 0-100 because historical registro data may carry a 100.
  if (progressPct > 99) {
    throw new UserError("progressManualCap");
  }

  const partida = await prisma.partida.findFirst({
    where: { id: partidaId, deletedAt: null, project: projectAccessWhere({ id: user.id, companyId: user.companyId, role: user.role }) },
    select: { id: true, projectId: true, completedAt: true },
  });
  if (!partida) throw new Error("Forbidden");
  if (partida.completedAt) {
    throw new UserError("progressConcluded");
  }
  await requireProjectStructureAccess({ id: user.id, companyId: user.companyId, role: user.role }, partida.projectId);

  // Atomic guarded update: the pre-check above already rejected a concluded
  // partida, but that read is not authoritative against a concurrent Conclude
  // racing this write. The WHERE re-checks completedAt under the row lock, so
  // if a concurrent conclude wins, this update matches 0 rows and must not
  // silently overwrite progressPct with a stale 100.
  const res = await prisma.partida.updateMany({ where: { id: partida.id, completedAt: null }, data: { progressPct } });
  if (res.count === 0) {
    throw new UserError("progressConcluded");
  }
  revalidatePath(`/app/projects/${partida.projectId}`);
  revalidatePath(`/app/partidas/${partida.id}`);
  revalidatePath("/app");
}

/** Panel form. The bare PartidaProgressForm keeps the throw. */
export async function updatePartidaProgressForm(_prev: FormError | null, formData: FormData): Promise<FormError | null> {
  return formResult("updatePartidaProgress", () => updatePartidaProgress(formData));
}
