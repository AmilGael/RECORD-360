"use server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { parseSegment } from "@/lib/registro/validate";
import { resolveSegment } from "@/lib/project/segments";
import { requireProjectStructureAccess } from "@/lib/authz/projects";
import { writeAudit } from "@/lib/audit/log";
import { sendBestEffort } from "@/lib/email";
import { passwordResetEmail, userInviteEmail } from "@/lib/email/templates";

/** Absolute login URL for emails, when APP_URL is configured. */
function loginUrl(): string | undefined {
  const base = process.env.APP_URL;
  return base ? `${base.replace(/\/$/, "")}/login` : undefined;
}

/** Cookie name shared with the admin page to flash a one-time temp password. */
const TEMP_PW_COOKIE = "r360_temp_pw";

const ADMIN_ROLES: Role[] = [Role.ADMIN, Role.MANAGER];

/** Require a signed-in user; returns their tenant + role. */
async function requireSession() {
  const session = await auth();
  const user = session?.user as { id?: string; companyId?: string; role?: Role } | undefined;
  if (!user?.id || !user.companyId || !user.role) throw new Error("Unauthorized");
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
  await prisma.project.create({
    data: {
      companyId,
      name: String(formData.get("name")),
      description: String(formData.get("description") ?? "") || null,
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

// Soft delete: archive an obra. Its partidas and immutable registros are
// preserved (never destroyed) — the obra is just hidden from the dashboard.
export async function archiveProject(formData: FormData) {
  const { companyId, role } = await requireAdmin();
  if (role !== Role.ADMIN) throw new Error("Forbidden");
  const id = String(formData.get("projectId"));
  const project = await prisma.project.findFirst({ where: { id, companyId } });
  if (!project) throw new Error("Forbidden");
  await prisma.project.update({ where: { id }, data: { archivedAt: new Date() } });
  revalidatePath("/app");
}

export async function restoreProject(formData: FormData) {
  const { companyId, role } = await requireAdmin();
  if (role !== Role.ADMIN) throw new Error("Forbidden");
  const id = String(formData.get("projectId"));
  const project = await prisma.project.findFirst({ where: { id, companyId } });
  if (!project) throw new Error("Forbidden");
  await prisma.project.update({ where: { id }, data: { archivedAt: null } });
  revalidatePath("/app");
}

export async function purgeProject(formData: FormData) {
  const { id: actorId, companyId, role } = await requireSession();
  if (role !== Role.ADMIN) throw new Error("Forbidden");
  const id = String(formData.get("projectId"));
  const project = await prisma.project.findFirst({ where: { id, companyId } });
  if (!project) throw new Error("Forbidden");
  if (!project.archivedAt) throw new Error("Archiva la obra antes de eliminarla definitivamente.");
  // refuse unless truly empty — protects immutable records
  const [partidas, changes, documents] = await Promise.all([
    prisma.partida.count({ where: { projectId: id } }),
    prisma.changeRequest.count({ where: { projectId: id } }),
    prisma.document.count({ where: { projectId: id } }),
  ]);
  if (partidas > 0 || changes > 0 || documents > 0)
    throw new Error("No se puede borrar definitivamente: la obra aún contiene partidas, cambios o documentos.");
  await prisma.$transaction(async (tx) => {
    // Delete non-cascading children in FK-safe order before deleting the project.
    // ProjectAssignment and PartidaTag already have onDelete: Cascade → skipped.
    // Segment and Location have no cascade → delete explicitly.
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
}

export async function createUser(formData: FormData) {
  // Minting users (incl. ADMINs) is ADMIN-only — stricter than other admin actions.
  const { companyId, role } = await requireSession();
  if (role !== Role.ADMIN) throw new Error("Forbidden");

  // Validate the submitted role against the enum instead of blindly casting.
  const submitted = String(formData.get("role"));
  if (!Object.values(Role).includes(submitted as Role)) throw new Error("Invalid role");

  const email = String(formData.get("email"));
  const name = String(formData.get("name"));

  // CSPRNG temp password (~96 bits), not Math.random().
  const tempPassword = randomBytes(12).toString("base64url");
  await prisma.user.create({
    data: {
      email,
      name,
      role: submitted as Role,
      companyId,
      passwordHash: await bcrypt.hash(tempPassword, 10),
    },
  });
  // Email the new user their access (best-effort; the temp password is also
  // shown once to the admin via the return value + banner).
  await sendBestEffort(userInviteEmail(email, name, tempPassword, loginUrl()));
  revalidatePath("/app/admin");
  return tempPassword;
}

/**
 * Reset a company member's password to a fresh CSPRNG temporary password.
 * ADMIN-only. Tenant-scoped: cannot reset users from another company.
 * The new temp password is flashed once via the TEMP_PW_COOKIE cookie and
 * revealed by the existing temp-password banner on the admin page.
 */
export async function resetUserPassword(formData: FormData) {
  // Password reset is ADMIN-only — same strictness as createUser.
  const { id: actorId, companyId, role } = await requireSession();
  if (role !== Role.ADMIN) throw new Error("Forbidden");

  const userId = String(formData.get("userId"));

  // Tenant scope: the target user must belong to the same company as the actor.
  const target = await prisma.user.findFirst({ where: { id: userId, companyId } });
  if (!target) throw new Error("Forbidden");

  // CSPRNG temp password — identical mechanism to createUser.
  const tempPassword = randomBytes(12).toString("base64url");
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { passwordHash } });
    await writeAudit(tx, {
      companyId,
      actorId,
      action: "user.password_reset",
      targetType: "User",
      targetId: userId,
      summary: `Admin reset password for user ${target.email}`,
    });
  });

  // Email the user their temp password (best-effort; the admin also sees it via
  // the cookie flash below as a fallback).
  await sendBestEffort(passwordResetEmail(target.email, tempPassword, loginUrl()));

  // Flash the temp password via a short-lived httpOnly cookie — same pattern
  // as the addUser wrapper in the admin page (maxAge 30 s, path /app/admin).
  (await cookies()).set(TEMP_PW_COOKIE, tempPassword, {
    httpOnly: true,
    sameSite: "lax",
    path: "/app/admin",
    maxAge: 30,
  });

  redirect("/app/admin");
}
