"use server";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Role, TokenPurpose } from "@prisma/client";
import { parseSegment } from "@/lib/registro/validate";
import { resolveSegment } from "@/lib/project/segments";
import { requireProjectStructureAccess } from "@/lib/authz/projects";
import { writeAudit } from "@/lib/audit/log";
import { mailer, sendBestEffort } from "@/lib/email";
import { accountActivationEmail, passwordResetLinkEmail } from "@/lib/email/templates";
import { createActivationToken, activationUrl, createToken, resetUrl } from "@/lib/auth/tokens";
import { requireFreshSession } from "@/lib/auth/session";
import { createNotifications } from "@/lib/notifications/create";
import { generateRegistrationCode } from "@/lib/project/registration-code";
import { storage } from "@/lib/storage";
import { uploadBrandedImage } from "@/lib/storage/image-upload";

/** Cookie name shared with the admin page to flash the reset-link-sent confirmation. */
const RESET_SENT_COOKIE = "r360_reset_sent";

const ADMIN_ROLES: Role[] = [Role.ADMIN, Role.MANAGER];

/** Require a signed-in user; returns their tenant + role. */
async function requireSession() {
  const user = await requireFreshSession();
  return { id: user.id, companyId: user.companyId, role: user.role };
}

/** Require a user who may administer the company (ADMIN or MANAGER). */
async function requireAdmin() {
  const ctx = await requireSession();
  if (!ADMIN_ROLES.includes(ctx.role)) throw new Error("Forbidden");
  return ctx;
}

export async function createProject(formData: FormData) {
  const { companyId } = await requireAdmin();
  const cover = formData.get("cover");
  const coverImageKey = cover instanceof File && cover.size > 0
    ? await uploadBrandedImage(cover, storage)
    : null;
  await prisma.project.create({
    data: {
      companyId,
      name: String(formData.get("name")),
      description: String(formData.get("description") ?? "") || null,
      registrationCode: generateRegistrationCode(),
      coverImageKey,
    },
  });
  revalidatePath("/app");
}

export async function createPartida(formData: FormData) {
  const user = await requireSession();
  const projectId = String(formData.get("projectId"));
  await requireProjectStructureAccess(user, projectId);
  const segmentId = await resolveSegment(projectId, parseSegment(formData.get("segment")));
  await prisma.partida.create({ data: { projectId, name: String(formData.get("name")), segmentId } });
  revalidatePath(`/app/projects/${projectId}`);
  revalidatePath("/app");
}

export async function createSegment(formData: FormData) {
  const user = await requireSession();
  const projectId = String(formData.get("projectId"));
  await requireProjectStructureAccess(user, projectId);
  await resolveSegment(projectId, parseSegment(formData.get("name")));
  revalidatePath(`/app/projects/${projectId}`);
  revalidatePath("/app");
}

// Permanent bloque delete (R3.3). Same policy family as purgeProject/purgePartida:
// ADMIN-only, empty-only (no partidas incl. recycled, no documents, no cambios links),
// audited, and notified as delete.permanent.
export async function deleteSegment(formData: FormData) {
  const { id: actorId, companyId, role } = await requireSession();
  if (role !== Role.ADMIN) throw new Error("Forbidden");

  const segmentId = String(formData.get("segmentId"));
  const segment = await prisma.segment.findFirst({
    where: { id: segmentId, project: { companyId } },
    select: { id: true, name: true, projectId: true },
  });
  if (!segment) throw new Error("Forbidden");

  const [partidas, documents, crLinks] = await Promise.all([
    prisma.partida.count({ where: { segmentId } }), // includes soft-deleted — history must move first
    prisma.document.count({ where: { segmentId } }),
    prisma.changeRequestSegment.count({ where: { segmentId } }),
  ]);
  if (partidas > 0 || documents > 0 || crLinks > 0) {
    throw new Error("No se puede borrar: el bloque contiene partidas, documentos o cambios. Muevelos o borralos primero.");
  }

  const [staff, assignments, actor] = await Promise.all([
    prisma.user.findMany({ where: { companyId, role: { in: [Role.ADMIN, Role.MANAGER] }, disabledAt: null }, select: { id: true } }),
    prisma.projectAssignment.findMany({ where: { projectId: segment.projectId }, select: { userId: true } }),
    prisma.user.findFirst({ where: { id: actorId }, select: { name: true } }),
  ]);
  const recipientIds = [...new Set([...staff.map((u) => u.id), ...assignments.map((a) => a.userId)])].filter((uid) => uid !== actorId);

  await prisma.$transaction(async (tx) => {
    await tx.segment.delete({ where: { id: segment.id } });
    await writeAudit(tx, {
      companyId,
      actorId,
      action: "segment.purge",
      targetType: "Segment",
      targetId: segment.id,
      summary: `Bloque borrado definitivamente: ${segment.name}`,
      metadata: { projectId: segment.projectId },
    });
  });
  await createNotifications(recipientIds.map((userId) => ({
    companyId,
    userId,
    type: "delete.permanent",
    title: `Bloque borrado definitivamente: ${segment.name}`,
    body: `Borrado por ${actor?.name ?? "—"}.`,
  })));
  revalidatePath(`/app/projects/${segment.projectId}`);
}

// Soft delete: archive an obra. Its partidas and immutable registros are
// preserved (never destroyed) — the obra is just hidden from the dashboard.
export async function archiveProject(formData: FormData) {
  // Archiving hides an entire obra from the whole company — ADMIN-only, matching
  // the "only admin deletes" policy (purgeProject is also ADMIN-only).
  const { companyId, role } = await requireAdmin();
  if (role !== Role.ADMIN) throw new Error("Forbidden");
  const id = String(formData.get("projectId"));
  const project = await prisma.project.findFirst({ where: { id, companyId } });
  if (!project) throw new Error("Forbidden");
  await prisma.project.update({ where: { id }, data: { archivedAt: new Date() } });
  revalidatePath("/app");
  revalidatePath(`/app/projects/${id}`);
}

export async function restoreProject(formData: FormData) {
  const { companyId, role } = await requireAdmin();
  if (role !== Role.ADMIN) throw new Error("Forbidden");
  const id = String(formData.get("projectId"));
  const project = await prisma.project.findFirst({ where: { id, companyId } });
  if (!project) throw new Error("Forbidden");
  await prisma.project.update({ where: { id }, data: { archivedAt: null } });
  revalidatePath("/app");
  revalidatePath(`/app/projects/${id}`);
}

export async function updateProjectCover(formData: FormData) {
  const { companyId } = await requireAdmin();
  const id = String(formData.get("projectId"));
  const project = await prisma.project.findFirst({ where: { id, companyId } });
  if (!project) throw new Error("Forbidden");
  const cover = formData.get("cover");
  if (!(cover instanceof File) || cover.size === 0) throw new Error("Selecciona una imagen.");
  const coverImageKey = await uploadBrandedImage(cover, storage);
  await prisma.project.update({ where: { id }, data: { coverImageKey } });
  revalidatePath("/app");
  revalidatePath(`/app/projects/${id}`);
}

export async function purgeProject(formData: FormData) {
  const { id: actorId, companyId, role } = await requireSession();
  if (role !== Role.ADMIN) throw new Error("Forbidden");

  const id = String(formData.get("projectId"));
  const project = await prisma.project.findFirst({ where: { id, companyId } });
  if (!project) throw new Error("Forbidden");
  if (!project.archivedAt) throw new Error("Archiva la obra antes de eliminarla definitivamente.");

  const [partidas, changes, documents] = await Promise.all([
    prisma.partida.count({ where: { projectId: id } }),
    prisma.changeRequest.count({ where: { projectId: id } }),
    prisma.document.count({ where: { projectId: id } }),
  ]);
  if (partidas > 0 || changes > 0 || documents > 0) {
    throw new Error("No se puede borrar definitivamente: la obra aún contiene partidas, cambios o documentos.");
  }

  const [staff, assignments, actor] = await Promise.all([
    prisma.user.findMany({ where: { companyId, role: { in: [Role.ADMIN, Role.MANAGER] }, disabledAt: null }, select: { id: true } }),
    prisma.projectAssignment.findMany({ where: { projectId: id }, select: { userId: true } }),
    prisma.user.findFirst({ where: { id: actorId }, select: { name: true } }),
  ]);
  const recipientIds = [...new Set([...staff.map((u) => u.id), ...assignments.map((a) => a.userId)])].filter((uid) => uid !== actorId);

  await prisma.$transaction(async (tx) => {
    await tx.location.deleteMany({ where: { projectId: id } });
    await tx.segment.deleteMany({ where: { projectId: id } });
    await tx.project.delete({ where: { id } });
    await writeAudit(tx, {
      companyId,
      actorId,
      action: "project.purge",
      targetType: "Project",
      targetId: id,
      summary: `Obra borrada definitivamente: ${project.name}`,
    });
  });
  revalidatePath("/app");
  await createNotifications(recipientIds.map((userId) => ({
    companyId,
    userId,
    type: "delete.permanent",
    title: `Obra borrada definitivamente: ${project.name}`,
    body: `Borrada por ${actor?.name ?? "—"}.`,
  })));
  redirect("/app");
}

export async function createUser(formData: FormData) {
  // Minting users (incl. ADMINs) is ADMIN-only — stricter than other admin actions.
  const { companyId, role } = await requireSession();
  if (role !== Role.ADMIN) throw new Error("Forbidden");

  // Tenant admins may only assign tenant roles — NEVER the platform SUPERADMIN
  // (which is created out-of-band via scripts/create-admin.ts).
  const ASSIGNABLE_ROLES: Role[] = [Role.ADMIN, Role.MANAGER, Role.SUPERVISOR, Role.RESIDENT];
  const submitted = String(formData.get("role"));
  if (!ASSIGNABLE_ROLES.includes(submitted as Role)) throw new Error("Invalid role");

  const email = String(formData.get("email")).trim().toLowerCase();
  const name = String(formData.get("name")).trim();

  // Inactive user: no password, not verified. They activate via the emailed link.
  const user = await prisma.user.create({
    data: { email, name, role: submitted as Role, companyId },
  });

  const raw = await createActivationToken(user.id);
  await mailer.send(accountActivationEmail(email, name, activationUrl(raw)));
  revalidatePath("/app/admin");
}

export async function resendInvite(formData: FormData) {
  const { companyId, role } = await requireSession();
  if (role !== Role.ADMIN) throw new Error("Forbidden");

  const userId = String(formData.get("userId"));
  const target = await prisma.user.findFirst({ where: { id: userId, companyId } });
  if (!target) throw new Error("Forbidden");
  if (target.emailVerifiedAt) throw new Error("Already activated"); // only pending users

  const raw = await createActivationToken(target.id);
  await mailer.send(accountActivationEmail(target.email, target.name, activationUrl(raw)));
  revalidatePath("/app/admin");
}

/**
 * Send a company member a single-use password-reset link (2h TTL).
 * ADMIN-only. Tenant-scoped: cannot reset users from another company.
 * Unactivated members are refused — they must use their activation link
 * ("Reenviar invitación") instead. No credential is generated or emailed.
 */
export async function resetUserPassword(formData: FormData) {
  const { id: actorId, companyId, role } = await requireSession();
  if (role !== Role.ADMIN) throw new Error("Forbidden");

  const userId = String(formData.get("userId"));

  const target = await prisma.user.findFirst({ where: { id: userId, companyId } });
  if (!target || !target.emailVerifiedAt) throw new Error("Forbidden");

  await prisma.$transaction(async (tx) => {
    await writeAudit(tx, {
      companyId,
      actorId,
      action: "user.password_reset",
      targetType: "User",
      targetId: userId,
      summary: `Admin sent password-reset link to ${target.email}`,
    });
  });

  const raw = await createToken(target.id, TokenPurpose.PASSWORD_RESET);
  await sendBestEffort(passwordResetLinkEmail(target.email, target.name, resetUrl(raw)));

  (await cookies()).set(RESET_SENT_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/app/admin",
    maxAge: 30,
  });

  redirect("/app/admin");
}
