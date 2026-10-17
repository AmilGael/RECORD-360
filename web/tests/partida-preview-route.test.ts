import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { generateRegistrationCode } from "@/lib/project/registration-code";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));

import { GET } from "@/app/api/partidas/[id]/preview/route";

let companyId = "", otherCompanyId = "";
let managerId = "", unassignedId = "", otherAdminId = "";
let projectId = "", partidaId = "", deletedId = "";

beforeAll(async () => {
  const s = `pvr-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `PVR Co ${s}` } })).id;
  otherCompanyId = (await prisma.company.create({ data: { name: `PVR Other ${s}` } })).id;
  managerId = (await prisma.user.create({ data: { email: `pvr-m-${s}@x.do`, name: "M", role: "MANAGER", companyId, passwordHash: "x" } })).id;
  unassignedId = (await prisma.user.create({ data: { email: `pvr-u-${s}@x.do`, name: "U", role: "RESIDENT", companyId, passwordHash: "x" } })).id;
  otherAdminId = (await prisma.user.create({ data: { email: `pvr-o-${s}@x.do`, name: "O", role: "ADMIN", companyId: otherCompanyId, passwordHash: "x" } })).id;
  projectId = (await prisma.project.create({ data: { companyId, name: `PVR Obra ${s}`, registrationCode: generateRegistrationCode() } })).id;
  partidaId = (await prisma.partida.create({ data: { projectId, name: "Ruta PV" } })).id;
  deletedId = (await prisma.partida.create({ data: { projectId, name: "Ruta borrada", deletedAt: new Date() } })).id;
});

afterAll(async () => {
  await prisma.partida.deleteMany({ where: { id: { in: [partidaId, deletedId] } } });
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.user.deleteMany({ where: { id: { in: [managerId, unassignedId, otherAdminId] } } });
  await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } });
  await prisma.$disconnect();
});

beforeEach(() => authMock.mockReset());

function call(id: string) {
  return GET(new Request(`http://test.local/api/partidas/${id}/preview`), { params: Promise.resolve({ id }) });
}

describe("GET /api/partidas/[id]/preview", () => {
  it("returns JSON with private no-store for a member", async () => {
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    const res = await call(partidaId);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    const body = await res.json();
    expect(body.id).toBe(partidaId);
    expect(body.name).toBe("Ruta PV");
  });

  it("404 for another tenant", async () => {
    authMock.mockResolvedValue({ user: { id: otherAdminId, companyId: otherCompanyId, role: "ADMIN" } });
    expect((await call(partidaId)).status).toBe(404);
  });

  it("404 for a deleted partida", async () => {
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    expect((await call(deletedId)).status).toBe(404);
  });

  it("404 for an unassigned resident", async () => {
    authMock.mockResolvedValue({ user: { id: unassignedId, companyId, role: "RESIDENT" } });
    expect((await call(partidaId)).status).toBe(404);
  });

  it("401 when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    expect((await call(partidaId)).status).toBe(401);
  });
});
