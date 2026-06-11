import { vi } from "vitest";
const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { canAccessProject, canManageProjectStructure, projectAccessWhere } from "@/lib/authz/projects";
import { generateRegistrationCode } from "@/lib/project/registration-code";
import { createPartida } from "@/app/actions/admin";
import { updatePartidaProgress } from "@/app/actions/partida-progress";

let companyId = "", managerId = "", residentId = "", supervisorId = "", activeId = "", archivedId = "";
let archivedPartidaId = "";

beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `Arch Co ${s}` } })).id;
  managerId = (await prisma.user.create({ data: { email: `mgr-${s}@x.do`, name: "Mgr", role: "MANAGER", companyId, passwordHash: "x" } })).id;
  residentId = (await prisma.user.create({ data: { email: `res-${s}@x.do`, name: "Res", role: "RESIDENT", companyId, passwordHash: "x" } })).id;
  supervisorId = (await prisma.user.create({ data: { email: `sup-${s}@x.do`, name: "Sup", role: "SUPERVISOR", companyId, passwordHash: "x" } })).id;
  activeId = (await prisma.project.create({ data: { companyId, name: `Activa ${s}`, registrationCode: generateRegistrationCode() } })).id;
  archivedId = (await prisma.project.create({ data: { companyId, name: `Archivada ${s}`, registrationCode: generateRegistrationCode(), archivedAt: new Date() } })).id;
  for (const userId of [residentId, supervisorId]) {
    for (const projectId of [activeId, archivedId]) {
      await prisma.projectAssignment.create({ data: { projectId, userId, role: "RESIDENT" } });
    }
  }
  archivedPartidaId = (await prisma.partida.create({ data: { projectId: archivedId, name: "Partida archivada" } })).id;
});

afterAll(async () => {
  await prisma.projectAssignment.deleteMany({ where: { project: { companyId } } });
  await prisma.partida.deleteMany({ where: { project: { companyId } } });
  await prisma.project.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
});

describe("archived obras are revoked for RESIDENT/SUPERVISOR (R1.6)", () => {
  it("assigned RESIDENT keeps the active obra, loses the archived one", async () => {
    const u = { id: residentId, companyId, role: "RESIDENT" as const };
    expect(await canAccessProject(u, activeId)).toBe(true);
    expect(await canAccessProject(u, archivedId)).toBe(false);
  });
  it("assigned SUPERVISOR loses the archived obra too", async () => {
    const u = { id: supervisorId, companyId, role: "SUPERVISOR" as const };
    expect(await canAccessProject(u, archivedId)).toBe(false);
  });
  it("MANAGER retains access to archived obras", async () => {
    const u = { id: managerId, companyId, role: "MANAGER" as const };
    expect(await canAccessProject(u, archivedId)).toBe(true);
  });
  it("list queries through projectAccessWhere exclude archived for restricted roles", async () => {
    const rows = await prisma.project.findMany({ where: projectAccessWhere({ id: residentId, companyId, role: "RESIDENT" }) });
    expect(rows.map((p) => p.id)).toContain(activeId);
    expect(rows.map((p) => p.id)).not.toContain(archivedId);
  });
});

describe("archived obras are write-revoked for RESIDENT/SUPERVISOR (R1.6 write paths)", () => {
  it("canManageProjectStructure denies assigned RESIDENT on an archived obra, allows on active", async () => {
    const u = { id: residentId, companyId, role: "RESIDENT" as const };
    expect(await canManageProjectStructure(u, activeId)).toBe(true);
    expect(await canManageProjectStructure(u, archivedId)).toBe(false);
  });
  it("MANAGER can still manage structure on an archived obra", async () => {
    expect(await canManageProjectStructure({ id: managerId, companyId, role: "MANAGER" as const }, archivedId)).toBe(true);
  });
  it("createPartida on an archived obra throws for an assigned RESIDENT", async () => {
    authMock.mockResolvedValue({ user: { id: residentId, companyId, role: "RESIDENT" } });
    const fd = new FormData();
    fd.set("projectId", archivedId);
    fd.set("name", "No debería existir");
    await expect(createPartida(fd)).rejects.toThrow(/Forbidden/);
  });
  it("updatePartidaProgress on a partida of an archived obra throws for an assigned RESIDENT", async () => {
    authMock.mockResolvedValue({ user: { id: residentId, companyId, role: "RESIDENT" } });
    const fd = new FormData();
    fd.set("partidaId", archivedPartidaId);
    fd.set("progressPct", "50");
    await expect(updatePartidaProgress(fd)).rejects.toThrow();
  });
});
