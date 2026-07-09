"use server";
import { prisma } from "@/lib/db";
import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireFreshSession } from "@/lib/auth/session";

const ASSIGNABLE_ROLES: Role[] = [Role.SUPERVISOR, Role.RESIDENT];

async function requireManager() {
  const user = await requireFreshSession();
  if (user.role !== Role.ADMIN && user.role !== Role.MANAGER) throw new Error("Forbidden");
  return { id: user.id, companyId: user.companyId, role: user.role };
}

function parseAssignableRole(raw: FormDataEntryValue | null) {
  const role = String(raw ?? "") as Role;
  if (!ASSIGNABLE_ROLES.includes(role)) throw new Error("Rol inválido.");
  return role;
}

export async function assignProjectUser(formData: FormData) {
  const user = await requireManager();
  const projectId = String(formData.get("projectId"));
  const userId = String(formData.get("userId"));
  const role = parseAssignableRole(formData.get("role"));

  const [project, assignee] = await Promise.all([
    prisma.project.findFirst({ where: { id: projectId, companyId: user.companyId }, select: { id: true } }),
    prisma.user.findFirst({ where: { id: userId, companyId: user.companyId }, select: { id: true, role: true, name: true } }),
  ]);
  if (!project || !assignee) throw new Error("Forbidden");
  if (assignee.role !== role) {
    throw new Error(`El rol global de ${assignee.name} es ${assignee.role}, no ${role}.`);
  }

  await prisma.projectAssignment.upsert({
    where: { projectId_userId: { projectId, userId } },
    create: { projectId, userId, role },
    update: { role },
  });
  revalidatePath(`/app/projects/${projectId}`);
  revalidatePath("/app");
}

export async function removeProjectAssignment(formData: FormData) {
  const user = await requireManager();
  const assignmentId = String(formData.get("assignmentId"));
  const assignment = await prisma.projectAssignment.findFirst({
    where: { id: assignmentId, project: { companyId: user.companyId } },
    select: { id: true, projectId: true },
  });
  if (!assignment) throw new Error("Forbidden");

  await prisma.projectAssignment.delete({ where: { id: assignment.id } });
  revalidatePath(`/app/projects/${assignment.projectId}`);
  revalidatePath("/app");
}
