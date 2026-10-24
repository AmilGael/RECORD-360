import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { generateRegistrationCode } from "@/lib/project/registration-code";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { purgeProject } from "@/app/actions/admin";
import { rejectedText } from "./helpers/user-message";

let companyId = "";
let otherCompanyId = "";
let adminId = "";
let managerId = "";

beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `Purge Co ${s}` } })).id;
  otherCompanyId = (await prisma.company.create({ data: { name: `Other Co ${s}` } })).id;
  adminId = (await prisma.user.create({ data: { email: `pa-${s}@x.do`, name: "A", role: "ADMIN", companyId, passwordHash: "x" } })).id;
  managerId = (await prisma.user.create({ data: { email: `pm-${s}@x.do`, name: "M", role: "MANAGER", companyId, passwordHash: "x" } })).id;
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { companyId } });
  await prisma.auditLog.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, managerId] } } });
  await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } });
  await prisma.$disconnect();
});

beforeEach(() => {
  authMock.mockReset();
  revalidatePathMock.mockReset();
});

function fd(projectId: string) {
  const f = new FormData();
  f.set("projectId", projectId);
  return f;
}
const asAdmin = () => authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
const asManager = () => authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });

/** Create an archived project for the main company, cleaned up automatically. */
async function makeArchivedProject(suffix: string) {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}-${suffix}`;
  return prisma.project.create({
    data: { companyId, name: `Purge Test ${s}`, archivedAt: new Date(), registrationCode: generateRegistrationCode() },
  });
}

describe("purgeProject — ADMIN-only permanent deletion", () => {
  function swallowRedirect(p: Promise<void>) {
    return p.catch((e: unknown) => {
      const isRedirect = (e instanceof Error && e.message === "NEXT_REDIRECT") ||
        ((e as { digest?: string }).digest?.startsWith?.("NEXT_REDIRECT") ?? false);
      if (!isRedirect) throw e;
    });
  }

  it("ADMIN purges an archived empty project and it is gone", async () => {
    asAdmin();
    const p = await makeArchivedProject("empty");
    await swallowRedirect(purgeProject(fd(p.id)));
    expect(await prisma.project.count({ where: { id: p.id } })).toBe(0);
    expect(revalidatePathMock).toHaveBeenCalledWith("/app");
  });

  it("ADMIN purges an archived empty project that has segments and locations (non-cascading) — they are deleted first", async () => {
    asAdmin();
    const p = await makeArchivedProject("with-children");
    // Add non-cascading children
    await prisma.segment.create({ data: { projectId: p.id, name: "Bloque A" } });
    await prisma.location.create({ data: { projectId: p.id, label: "Piso 1" } });
    await swallowRedirect(purgeProject(fd(p.id)));
    expect(await prisma.project.count({ where: { id: p.id } })).toBe(0);
    // Segments and locations are gone too
    expect(await prisma.segment.count({ where: { projectId: p.id } })).toBe(0);
    expect(await prisma.location.count({ where: { projectId: p.id } })).toBe(0);
  });

  it("refuses when the project has a partida — project still exists", async () => {
    asAdmin();
    const p = await makeArchivedProject("has-partida");
    const partida = await prisma.partida.create({ data: { projectId: p.id, name: "Vaciado losa" } });
    expect(await rejectedText(purgeProject(fd(p.id)))).toMatch(/partidas|cambios|documentos/i);
    expect(await prisma.project.count({ where: { id: p.id } })).toBe(1);
    // cleanup
    await prisma.partida.delete({ where: { id: partida.id } });
    await prisma.project.delete({ where: { id: p.id } });
  });

  it("refuses when the project is NOT archived — project still exists", async () => {
    asAdmin();
    const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const p = await prisma.project.create({ data: { companyId, name: `Active Project ${s}`, registrationCode: generateRegistrationCode() } }); // no archivedAt
    expect(await rejectedText(purgeProject(fd(p.id)))).toMatch(/archiva/i);
    expect(await prisma.project.count({ where: { id: p.id } })).toBe(1);
    // cleanup
    await prisma.project.delete({ where: { id: p.id } });
  });

  it("MANAGER cannot purge (admin-only) — project still exists", async () => {
    asManager();
    const p = await makeArchivedProject("mgr-cannot-purge");
    await expect(purgeProject(fd(p.id))).rejects.toThrow(/forbidden/i);
    expect(await prisma.project.count({ where: { id: p.id } })).toBe(1);
    // cleanup
    await prisma.project.delete({ where: { id: p.id } });
  });

  it("cannot purge a project from another company — Forbidden", async () => {
    asAdmin(); // actor is in `companyId`
    const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const other = await prisma.project.create({
      data: { companyId: otherCompanyId, name: `Other Co Proj ${s}`, archivedAt: new Date(), registrationCode: generateRegistrationCode() },
    });
    await expect(purgeProject(fd(other.id))).rejects.toThrow(/forbidden/i);
    expect(await prisma.project.count({ where: { id: other.id } })).toBe(1);
    // cleanup
    await prisma.project.delete({ where: { id: other.id } });
  });
});
