"use server";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { projectAccessWhere } from "@/lib/authz/projects";
import { requireFreshSession } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit/log";
import { notifyEvent, resolveRecipients } from "@/lib/notifications/events";

// Mark a registro's reminder as resolved. Any member with access to the registro's
// project (admin/manager company-wide, resident/supervisor if assigned) may resolve.
// The registro itself is immutable; reminderResolvedAt is metadata, not hash content.
//
// R3 WS1: this predates the remediation (see git history) and is not owned by
// any single R3 agent's exclusive file list, so it is extended in place rather
// than forked into a new actions file — audit + notification now follow the
// same guarded-update idempotency pattern as app/actions/lifecycle.ts: the
// UPDATE's WHERE clause is re-checked against the committed row, so of two
// concurrent resolves exactly one writes audit/notification.
export async function resolveReminder(formData: FormData) {
  const user = await requireFreshSession();

  const registroId = String(formData.get("registroId"));
  const reg = await prisma.registro.findFirst({
    where: {
      id: registroId,
      reminderDueAt: { not: null },
      partida: { deletedAt: null, project: projectAccessWhere({ id: user.id, companyId: user.companyId, role: user.role }) },
    },
    select: {
      id: true, authorId: true, text: true, reminderResolvedAt: true,
      partida: { select: { id: true, name: true, projectId: true } },
    },
  });
  if (!reg) throw new Error("Forbidden");

  if (reg.reminderResolvedAt) return; // idempotent fast path: already resolved

  const didChange = await prisma.$transaction(async (tx) => {
    const res = await tx.registro.updateMany({
      where: { id: reg.id, reminderResolvedAt: null },
      data: { reminderResolvedAt: new Date() },
    });
    if (res.count === 0) return false;
    await writeAudit(tx, {
      companyId: user.companyId,
      actorId: user.id,
      action: "reminder.resolved",
      targetType: "Registro",
      targetId: reg.id,
      summary: `Recordatorio resuelto: ${(reg.text ?? "").slice(0, 80) || reg.id}`,
      metadata: { projectId: reg.partida.projectId, partidaId: reg.partida.id },
    });
    return true;
  });
  if (!didChange) return; // lost the race: another call already resolved it

  // The registro author must always hear their reminder was resolved, even if
  // they've since dropped off the project's default stakeholder policy — union
  // them in explicitly (same shape as resolveChangeRequest in actions/cambios.ts).
  const title = `Recordatorio resuelto: ${reg.partida.name}`;
  const stakeholders = await resolveRecipients({
    key: "reminder.resolved", companyId: user.companyId, actorId: user.id, projectId: reg.partida.projectId, title,
  });
  const recipientIds = [...new Set([reg.authorId, ...stakeholders])];
  await notifyEvent({
    key: "reminder.resolved",
    companyId: user.companyId,
    actorId: user.id,
    projectId: reg.partida.projectId,
    title,
    link: `/app/partidas/${reg.partida.id}`,
    recipientIds,
  });

  revalidatePath(`/app/projects/${reg.partida.projectId}`);
  revalidatePath(`/app/partidas/${reg.partida.id}`);
  revalidatePath("/app/pending");
}
