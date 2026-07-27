import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import { prisma } from "@/lib/db";
import { generateRegistrationCode } from "@/lib/project/registration-code";
import { SEAL_WARNING_HEADER } from "@/lib/report/params";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
// firma/seal bytes come from storage — serve a tiny valid PNG so pdfkit can embed it.
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
vi.mock("@/lib/storage", () => ({
  storage: { put: vi.fn(), get: vi.fn(async () => Readable.from([PNG_1PX])) },
}));

import { GET } from "@/app/api/informes/[id]/pdf/route";

let companyId = "", outCompanyId = "", noSealCompanyId = "", managerId = "", outsiderId = "", noSealManagerId = "", projectId = "", informeId = "";
let noSealProjectId = "", noSealInformeId = "", archetypeInformeId = "";

beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `IP Co ${s}`, sealKey: "seal-ip.png" } })).id;
  outCompanyId = (await prisma.company.create({ data: { name: `IP Out ${s}` } })).id;
  managerId = (await prisma.user.create({ data: { email: `mgr-${s}@x.do`, name: "Mgr IP", role: "MANAGER", companyId, passwordHash: "x", signatureKey: "firma-ip.png" } })).id;
  outsiderId = (await prisma.user.create({ data: { email: `out-${s}@x.do`, name: "Out", role: "MANAGER", companyId: outCompanyId, passwordHash: "x" } })).id;
  projectId = (await prisma.project.create({ data: { companyId, name: `IP Obra ${s}`, registrationCode: generateRegistrationCode() } })).id;
  informeId = (await prisma.informe.create({
    data: {
      projectId, requestedById: managerId, brief: "Mensual",
      contentMd: "# Resumen Ejecutivo\nAvance constante.\n# Recomendaciones\n- Continuar",
      model: "claude-sonnet-4-6",
    },
  })).id;
  archetypeInformeId = (await prisma.informe.create({
    data: {
      projectId, requestedById: managerId, brief: "Para el propietario", archetype: "OWNER",
      contentMd: "# Resumen Ejecutivo\nTodo en orden.",
      model: "claude-sonnet-4-6",
    },
  })).id;

  // R3 WS11: a company with NO seal on file — the mirror case for the
  // missing-seal warning header.
  noSealCompanyId = (await prisma.company.create({ data: { name: `IP NoSeal ${s}` } })).id;
  noSealManagerId = (await prisma.user.create({ data: { email: `nosealmgr-${s}@x.do`, name: "Mgr NoSeal", role: "MANAGER", companyId: noSealCompanyId, passwordHash: "x", signatureKey: "firma-noseal.png" } })).id;
  noSealProjectId = (await prisma.project.create({ data: { companyId: noSealCompanyId, name: `IP NoSeal Obra ${s}`, registrationCode: generateRegistrationCode() } })).id;
  noSealInformeId = (await prisma.informe.create({
    data: {
      projectId: noSealProjectId, requestedById: noSealManagerId, brief: "Sin sello",
      contentMd: "# Resumen Ejecutivo\nSin sello de compania.",
      model: "claude-sonnet-4-6",
    },
  })).id;
});

afterAll(async () => {
  await prisma.informe.deleteMany({ where: { projectId: { in: [projectId, noSealProjectId] } } });
  await prisma.project.deleteMany({ where: { companyId: { in: [companyId, noSealCompanyId] } } });
  await prisma.user.deleteMany({ where: { companyId: { in: [companyId, outCompanyId, noSealCompanyId] } } });
  await prisma.company.deleteMany({ where: { id: { in: [companyId, outCompanyId, noSealCompanyId] } } });
});

function call(id: string) {
  return GET(new Request("http://test/x"), { params: Promise.resolve({ id }) });
}

describe("informe PDF route", () => {
  it("company member downloads the informe as PDF (firma + seal embedded)", async () => {
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    const res = await call(informeId);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  });
  it("cross-tenant access is 404", async () => {
    authMock.mockResolvedValue({ user: { id: outsiderId, companyId: outCompanyId, role: "MANAGER" } });
    expect((await call(informeId)).status).toBe(404);
  });
  it("omits the missing-seal warning header when the company has a seal on file", async () => {
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    const res = await call(informeId);
    expect(res.headers.get(SEAL_WARNING_HEADER)).toBeNull();
  });
  it("sets the missing-seal warning header when the company has no seal on file (R3 WS11)", async () => {
    authMock.mockResolvedValue({ user: { id: noSealManagerId, companyId: noSealCompanyId, role: "MANAGER" } });
    const res = await call(noSealInformeId);
    expect(res.status).toBe(200);
    expect(res.headers.get(SEAL_WARNING_HEADER)).toBeTruthy();
  });
  it("renders without error when the informe has an archetype (audience label under the header, WS7)", async () => {
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    const res = await call(archetypeInformeId);
    expect(res.status).toBe(200);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
