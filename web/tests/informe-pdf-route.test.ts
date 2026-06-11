import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import { prisma } from "@/lib/db";
import { generateRegistrationCode } from "@/lib/project/registration-code";

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

let companyId = "", outCompanyId = "", managerId = "", outsiderId = "", projectId = "", informeId = "";

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
});

afterAll(async () => {
  await prisma.informe.deleteMany({ where: { projectId } });
  await prisma.project.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId: { in: [companyId, outCompanyId] } } });
  await prisma.company.deleteMany({ where: { id: { in: [companyId, outCompanyId] } } });
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
});
