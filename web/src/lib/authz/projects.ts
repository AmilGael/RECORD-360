import { Role, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type SessionUser = {
  id: string;
  companyId: string;
  role: Role;
};

export const COMPANY_WIDE_ROLES: Role[] = [Role.ADMIN, Role.MANAGER];

export function hasCompanyWideAccess(role: Role) {
  return COMPANY_WIDE_ROLES.includes(role);
}

export function projectAccessWhere(user: SessionUser): Prisma.ProjectWhereInput {
  const base = { companyId: user.companyId };
  if (hasCompanyWideAccess(user.role)) return base;
  return { ...base, assignments: { some: { userId: user.id } } };
}

export async function canAccessProject(user: SessionUser, projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, ...projectAccessWhere(user) },
    select: { id: true },
  });
  return Boolean(project);
}

export async function requireProjectAccess(user: SessionUser, projectId: string) {
  if (!(await canAccessProject(user, projectId))) throw new Error("Forbidden");
}

export async function canManageProjectStructure(user: SessionUser, projectId: string) {
  if (hasCompanyWideAccess(user.role)) {
    const project = await prisma.project.findFirst({ where: { id: projectId, companyId: user.companyId }, select: { id: true } });
    return Boolean(project);
  }
  const assignment = await prisma.projectAssignment.findFirst({
    where: { projectId, userId: user.id, project: { companyId: user.companyId } },
    select: { id: true },
  });
  return Boolean(assignment);
}

export async function requireProjectStructureAccess(user: SessionUser, projectId: string) {
  if (!(await canManageProjectStructure(user, projectId))) throw new Error("Forbidden");
}

export async function canAccessMediaProject(user: { id?: string; companyId?: string; role?: Role }, projectId: string) {
  if (!user.id || !user.companyId || !user.role) return false;
  return canAccessProject({ id: user.id, companyId: user.companyId, role: user.role }, projectId);
}
