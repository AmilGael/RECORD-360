"use server";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { projectAccessWhere } from "@/lib/authz/projects";
import { requireFreshSession } from "@/lib/auth/session";

// Mark a registro's reminder as resolved. Any member with access to the registro's
// project (admin/manager company-wide, resident/supervisor if assigned) may resolve.
// The registro itself is immutable; reminderResolvedAt is metadata, not hash content.
export async function resolveReminder(formData: FormData) {
  const user = await requireFreshSession();

  const registroId = String(formData.get("registroId"));
  const reg = await prisma.registro.findFirst({
    where: {
      id: registroId,
      reminderDueAt: { not: null },
      reminderResolvedAt: null,
      partida: { deletedAt: null, project: projectAccessWhere({ id: user.id, companyId: user.companyId, role: user.role }) },
    },
    select: { id: true, partida: { select: { projectId: true } } },
  });
  if (!reg) throw new Error("Forbidden");

  await prisma.registro.update({ where: { id: reg.id }, data: { reminderResolvedAt: new Date() } });
  revalidatePath(`/app/projects/${reg.partida.projectId}`);
}
