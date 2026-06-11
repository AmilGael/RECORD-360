import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { generateRegistrationCode } from "@/lib/project/registration-code";

const authMock = vi.hoisted(() => vi.fn());
const generateMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/informes/client", () => ({
  INFORME_MODEL: "claude-sonnet-4-6",
  generateInformeContent: generateMock,
}));

import { createInforme } from "@/app/actions/informes";

let companyId = "", outCompanyId = "", managerId = "", noFirmaId = "", outsiderId = "", projectId = "";

function fd(obj: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return f;
}

beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `Inf Co ${s}`, sealKey: "seal-inf.png" } })).id;
  outCompanyId = (await prisma.company.create({ data: { name: `Inf Out ${s}` } })).id;
  managerId = (await prisma.user.create({ data: { email: `mgr-${s}@x.do`, name: "Mgr Inf", role: "MANAGER", companyId, passwordHash: "x", signatureKey: "firma-inf.png" } })).id;
  noFirmaId = (await prisma.user.create({ data: { email: `nf-${s}@x.do`, name: "Sin Firma", role: "ADMIN", companyId, passwordHash: "x" } })).id;
  outsiderId = (await prisma.user.create({ data: { email: `out-${s}@x.do`, name: "Out", role: "MANAGER", companyId: outCompanyId, passwordHash: "x" } })).id;
  projectId = (await prisma.project.create({ data: { companyId, name: `Inf Obra ${s}`, registrationCode: generateRegistrationCode() } })).id;
});

afterAll(async () => {
  await prisma.informe.deleteMany({ where: { projectId } });
  await prisma.project.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId: { in: [companyId, outCompanyId] } } });
  await prisma.company.deleteMany({ where: { id: { in: [companyId, outCompanyId] } } });
});

describe("createInforme", () => {
  it("persists a generated informe and returns its id", async () => {
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    generateMock.mockResolvedValue("# Resumen Ejecutivo\nTodo bien.");
    const res = await createInforme(null, fd({ projectId, scopeType: "project", scopeId: projectId, brief: "Informe mensual para el cliente" }));
    expect(res).toMatchObject({ ok: true });
    const informe = await prisma.informe.findFirstOrThrow({ where: { projectId } });
    expect(informe.contentMd).toContain("Resumen Ejecutivo");
    expect(informe.model).toBe("claude-sonnet-4-6");
    expect(informe.requestedById).toBe(managerId);
  });
  it("fails with a firma-specific error when the requester has no signature", async () => {
    authMock.mockResolvedValue({ user: { id: noFirmaId, companyId, role: "ADMIN" } });
    const res = await createInforme(null, fd({ projectId, scopeType: "project", scopeId: projectId, brief: "x" }));
    expect(res).toMatchObject({ ok: false, missingFirma: true });
  });
  it("requires a brief", async () => {
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    const res = await createInforme(null, fd({ projectId, scopeType: "project", scopeId: projectId, brief: "  " }));
    expect(res).toMatchObject({ ok: false });
    expect((res as { error?: string }).error).toMatch(/describe/i);
  });
  it("cross-tenant project is rejected", async () => {
    authMock.mockResolvedValue({ user: { id: outsiderId, companyId: outCompanyId, role: "MANAGER" } });
    const res = await createInforme(null, fd({ projectId, scopeType: "project", scopeId: projectId, brief: "x" }));
    expect(res).toMatchObject({ ok: false });
  });
  it("surfaces generator failures as a friendly error", async () => {
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    generateMock.mockRejectedValue(new Error("api down"));
    const res = await createInforme(null, fd({ projectId, scopeType: "project", scopeId: projectId, brief: "y" }));
    expect(res).toMatchObject({ ok: false });
  });
});
