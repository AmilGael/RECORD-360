import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { appendRegistro } from "@/lib/registro/append";
import { generateRegistrationCode } from "@/lib/project/registration-code";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));

import { GET as projectReport } from "@/app/api/projects/[id]/report/route";
import { GET as segmentReport } from "@/app/api/segments/[id]/report/route";

let companyAId = "", companyBId = "", managerAId = "", userBId = "", projectAId = "", segmentAId = "", partidaAId = "";

beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyAId = (await prisma.company.create({ data: { name: `SR Co A ${s}` } })).id;
  companyBId = (await prisma.company.create({ data: { name: `SR Co B ${s}` } })).id;
  managerAId = (await prisma.user.create({ data: { email: `sr-a-${s}@x.do`, name: "Mgr A", role: "MANAGER", companyId: companyAId, passwordHash: "x" } })).id;
  userBId = (await prisma.user.create({ data: { email: `sr-b-${s}@x.do`, name: "Usr B", role: "MANAGER", companyId: companyBId, passwordHash: "x" } })).id;
  projectAId = (await prisma.project.create({ data: { companyId: companyAId, name: `SR Obra ${s}`, registrationCode: generateRegistrationCode() } })).id;
  segmentAId = (await prisma.segment.create({ data: { projectId: projectAId, name: "Bloque SR" } })).id;
  partidaAId = (await prisma.partida.create({ data: { projectId: projectAId, segmentId: segmentAId, name: "Partida SR" } })).id;
  await appendRegistro({ partidaId: partidaAId, authorId: managerAId, text: "registro sr", category: null, progressPct: null, gpsLat: null, gpsLng: null, locationId: null, attachments: [] } as Parameters<typeof appendRegistro>[0]);
});

afterAll(async () => {
  await prisma.registro.deleteMany({ where: { partida: { project: { companyId: companyAId } } } });
  await prisma.partida.deleteMany({ where: { project: { companyId: companyAId } } });
  await prisma.segment.deleteMany({ where: { projectId: projectAId } });
  await prisma.project.deleteMany({ where: { companyId: companyAId } });
  await prisma.user.deleteMany({ where: { companyId: { in: [companyAId, companyBId] } } });
  await prisma.company.deleteMany({ where: { id: { in: [companyAId, companyBId] } } });
});

function call(fn: typeof projectReport, id: string, qs = "") {
  return fn(new Request(`http://test/x${qs}`), { params: Promise.resolve({ id }) });
}

describe("scoped report routes", () => {
  it("project report returns a PDF for a company member", async () => {
    authMock.mockResolvedValue({ user: { id: managerAId, companyId: companyAId, role: "MANAGER" } });
    const res = await call(projectReport, projectAId);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
  });
  it("segment report returns a PDF and honors from/to params", async () => {
    authMock.mockResolvedValue({ user: { id: managerAId, companyId: companyAId, role: "MANAGER" } });
    const res = await call(segmentReport, segmentAId, "?from=2020-01-01&to=2030-01-01");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
  });
  it("cross-tenant access is a 404 on both routes", async () => {
    authMock.mockResolvedValue({ user: { id: userBId, companyId: companyBId, role: "MANAGER" } });
    expect((await call(projectReport, projectAId)).status).toBe(404);
    expect((await call(segmentReport, segmentAId)).status).toBe(404);
  });
  it("garbage date params are rejected with 400", async () => {
    authMock.mockResolvedValue({ user: { id: managerAId, companyId: companyAId, role: "MANAGER" } });
    expect((await call(projectReport, projectAId, "?from=not-a-date")).status).toBe(400);
  });
});
