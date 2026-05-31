"use server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";

const ADMIN_ROLES: Role[] = [Role.ADMIN, Role.MANAGER];

/** Require a signed-in user; returns their tenant + role. */
async function requireSession() {
  const session = await auth();
  const user = session?.user as { companyId?: string; role?: Role } | undefined;
  if (!user?.companyId || !user.role) throw new Error("Unauthorized");
  return { companyId: user.companyId, role: user.role };
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
  const { companyId } = await requireAdmin();
  const projectId = String(formData.get("projectId"));
  // Cross-tenant guard: the project must belong to the caller's company.
  const project = await prisma.project.findFirst({ where: { id: projectId, companyId } });
  if (!project) throw new Error("Forbidden");
  await prisma.partida.create({ data: { projectId, name: String(formData.get("name")) } });
  revalidatePath(`/app/projects/${projectId}`);
}

// Soft delete: archive an obra. Its partidas and immutable registros are
// preserved (never destroyed) — the obra is just hidden from the dashboard.
export async function archiveProject(formData: FormData) {
  const { companyId } = await requireAdmin();
  const id = String(formData.get("projectId"));
  const project = await prisma.project.findFirst({ where: { id, companyId } });
  if (!project) throw new Error("Forbidden");
  await prisma.project.update({ where: { id }, data: { archivedAt: new Date() } });
  revalidatePath("/app");
}

export async function restoreProject(formData: FormData) {
  const { companyId } = await requireAdmin();
  const id = String(formData.get("projectId"));
  const project = await prisma.project.findFirst({ where: { id, companyId } });
  if (!project) throw new Error("Forbidden");
  await prisma.project.update({ where: { id }, data: { archivedAt: null } });
  revalidatePath("/app");
}

export async function createUser(formData: FormData) {
  // Minting users (incl. ADMINs) is ADMIN-only — stricter than other admin actions.
  const { companyId, role } = await requireSession();
  if (role !== Role.ADMIN) throw new Error("Forbidden");

  // Validate the submitted role against the enum instead of blindly casting.
  const submitted = String(formData.get("role"));
  if (!Object.values(Role).includes(submitted as Role)) throw new Error("Invalid role");

  // CSPRNG temp password (~96 bits), not Math.random().
  const tempPassword = randomBytes(12).toString("base64url");
  await prisma.user.create({
    data: {
      email: String(formData.get("email")),
      name: String(formData.get("name")),
      role: submitted as Role,
      companyId,
      passwordHash: await bcrypt.hash(tempPassword, 10),
    },
  });
  revalidatePath("/app/admin");
  return tempPassword;
}
