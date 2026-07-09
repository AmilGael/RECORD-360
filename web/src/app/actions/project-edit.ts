"use server";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit/log";
import { parseSegment } from "@/lib/registro/validate";
import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireProjectStructureAccess, projectAccessWhere } from "@/lib/authz/projects";
import { requireFreshSession } from "@/lib/auth/session";

const MANAGER_ROLES: Role[] = [Role.ADMIN, Role.MANAGER];

async function requireSession() {
  const user = await requireFreshSession();
  return { id: user.id, companyId: user.companyId, role: user.role };
}

async function requireManager() {
  const user = await requireSession();
  if (!MANAGER_ROLES.includes(user.role)) throw new Error("Forbidden");
  return user;
}

function parseName(raw: FormDataEntryValue | null, label: string, max = 120) {
  const value = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!value) throw new Error(`${label} es obligatorio.`);
  if (value.length > max) throw new Error(`${label} es demasiado largo.`);
  return value;
}

export async function renameProject(formData: FormData) {
  const user = await requireManager();
  const projectId = String(formData.get("projectId"));
  const name = parseName(formData.get("name"), "El nombre de la obra");

  const project = await prisma.project.findFirst({
    where: { id: projectId, companyId: user.companyId },
    select: { id: true, name: true },
  });
  if (!project) throw new Error("Forbidden");
  if (project.name === name) return;

  await prisma.$transaction(async (tx) => {
    await tx.project.update({ where: { id: project.id }, data: { name } });
    await writeAudit(tx, {
      companyId: user.companyId,
      actorId: user.id,
      action: "project.rename",
      targetType: "Project",
      targetId: project.id,
      summary: `Obra renombrada: ${project.name} -> ${name}`,
      metadata: { oldName: project.name, newName: name },
    });
  });
  revalidatePath("/app");
  revalidatePath(`/app/projects/${project.id}`);
}

export async function renameSegment(formData: FormData) {
  const user = await requireSession();
  const segmentId = String(formData.get("segmentId"));
  const name = parseSegment(formData.get("name"));
  if (!name) throw new Error("El nombre del bloque es obligatorio.");

  const segment = await prisma.segment.findFirst({
    where: { id: segmentId, project: projectAccessWhere(user) },
    select: { id: true, projectId: true, name: true },
  });
  if (!segment) throw new Error("Forbidden");
  await requireProjectStructureAccess(user, segment.projectId);
  if (segment.name === name) return;

  const duplicate = await prisma.segment.findFirst({
    where: {
      projectId: segment.projectId,
      id: { not: segment.id },
      name: { equals: name, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (duplicate) throw new Error("Ya existe un bloque con ese nombre.");

  await prisma.$transaction(async (tx) => {
    await tx.segment.update({ where: { id: segment.id }, data: { name } });
    await writeAudit(tx, {
      companyId: user.companyId,
      actorId: user.id,
      action: "segment.rename",
      targetType: "Segment",
      targetId: segment.id,
      summary: `Bloque renombrado: ${segment.name} -> ${name}`,
      metadata: { projectId: segment.projectId, oldName: segment.name, newName: name },
    });
  });
  revalidatePath(`/app/projects/${segment.projectId}`);
}

export async function renamePartida(formData: FormData) {
  const user = await requireSession();
  const partidaId = String(formData.get("partidaId"));
  const name = parseName(formData.get("name"), "El nombre de la partida");

  const partida = await prisma.partida.findFirst({
    where: { id: partidaId, deletedAt: null, project: projectAccessWhere(user) },
    select: { id: true, projectId: true, name: true },
  });
  if (!partida) throw new Error("Forbidden");
  await requireProjectStructureAccess(user, partida.projectId);
  if (partida.name === name) return;

  await prisma.$transaction(async (tx) => {
    await tx.partida.update({ where: { id: partida.id }, data: { name } });
    await writeAudit(tx, {
      companyId: user.companyId,
      actorId: user.id,
      action: "partida.rename",
      targetType: "Partida",
      targetId: partida.id,
      summary: `Partida renombrada: ${partida.name} -> ${name}`,
      metadata: { projectId: partida.projectId, oldName: partida.name, newName: name },
    });
  });
  revalidatePath(`/app/projects/${partida.projectId}`);
  revalidatePath(`/app/partidas/${partida.id}`);
}

export async function movePartida(formData: FormData) {
  const user = await requireSession();
  const partidaId = String(formData.get("partidaId"));
  const rawSegmentId = String(formData.get("segmentId") ?? "");
  const segmentId = rawSegmentId ? rawSegmentId : null;

  const partida = await prisma.partida.findFirst({
    where: { id: partidaId, deletedAt: null, project: projectAccessWhere(user) },
    select: { id: true, projectId: true, name: true, segmentId: true },
  });
  if (!partida) throw new Error("Forbidden");
  await requireProjectStructureAccess(user, partida.projectId);
  if (partida.segmentId === segmentId) return;

  if (segmentId) {
    const segment = await prisma.segment.findFirst({
      where: { id: segmentId, projectId: partida.projectId },
      select: { id: true },
    });
    if (!segment) throw new Error("Bloque inválido.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.partida.update({ where: { id: partida.id }, data: { segmentId } });
    await writeAudit(tx, {
      companyId: user.companyId,
      actorId: user.id,
      action: "partida.move",
      targetType: "Partida",
      targetId: partida.id,
      summary: `Partida movida: ${partida.name}`,
      metadata: { projectId: partida.projectId, oldSegmentId: partida.segmentId, newSegmentId: segmentId },
    });
  });
  revalidatePath(`/app/projects/${partida.projectId}`);
}
