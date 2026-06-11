import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { purgeProject } from "@/app/actions/admin";
import { purgePartida } from "@/app/actions/partida-crud";

let companyId = "", adminId = "", managerId = "", residentId = "";

function fd(obj: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return f;
}

beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `Purge Co ${s}` } })).id;
  adminId = (await prisma.user.create({ data: { email: `adm-${s}@x.do`, name: "Adm", role: "ADMIN", companyId, passwordHash: "x" } })).id;
  managerId = (await prisma.user.create({ data: { email: `mgr-${s}@x.do`, name: "Mgr", role: "MANAGER", companyId, passwordHash: "x" } })).id;
  residentId = (await prisma.user.create({ data: { email: `res-${s}@x.do`, name: "Res", role: "RESIDENT", companyId, passwordHash: "x" } })).id;
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { companyId } });
  await prisma.auditLog.deleteMany({ where: { companyId } });
  await prisma.projectAssignment.deleteMany({ where: { project: { companyId } } });
  await prisma.partida.deleteMany({ where: { project: { companyId } } });
  await prisma.project.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
});

describe("permanent deletes create notifications", () => {
  it("purgeProject notifies MANAGER and assigned users; NOT the actor (ADMIN)", async () => {
    const project = await prisma.project.create({
      data: { companyId, name: "Obra a borrar", archivedAt: new Date() },
    });
    await prisma.projectAssignment.create({ data: { projectId: project.id, userId: residentId, role: "RESIDENT" } });
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });

    await purgeProject(fd({ projectId: project.id })).catch((e: unknown) => {
      // purgeProject redirects after success — swallow it
      const isRedirect = (e instanceof Error && e.message === "NEXT_REDIRECT") ||
        ((e as { digest?: string }).digest?.startsWith?.("NEXT_REDIRECT") ?? false);
      if (!isRedirect) throw e;
    });

    const mgrNote = await prisma.notification.findFirst({ where: { userId: managerId, type: "delete.permanent" } });
    const resNote = await prisma.notification.findFirst({ where: { userId: residentId, type: "delete.permanent" } });
    const actorNote = await prisma.notification.findFirst({ where: { userId: adminId, type: "delete.permanent" } });
    expect(mgrNote?.title).toContain("Obra a borrar");
    expect(resNote).not.toBeNull();
    expect(actorNote).toBeNull();
  });

  it("purgePartida notifies MANAGER with the partida name", async () => {
    const project = await prisma.project.create({ data: { companyId, name: "Obra viva" } });
    const partida = await prisma.partida.create({
      data: { projectId: project.id, name: "Partida fantasma", deletedAt: new Date(), deletedById: adminId },
    });
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });

    await purgePartida(fd({ partidaId: partida.id }));

    const mgrNote = await prisma.notification.findFirst({
      where: { userId: managerId, type: "delete.permanent", title: { contains: "Partida fantasma" } },
    });
    expect(mgrNote).not.toBeNull();
  });
});
