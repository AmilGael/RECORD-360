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
  process.env.ANTHROPIC_API_KEY = "test-key";
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `Inf Co ${s}`, sealKey: "seal-inf.png" } })).id;
  outCompanyId = (await prisma.company.create({ data: { name: `Inf Out ${s}` } })).id;
  managerId = (await prisma.user.create({ data: { email: `mgr-${s}@x.do`, name: "Mgr Inf", role: "MANAGER", companyId, passwordHash: "x", signatureKey: "firma-inf.png" } })).id;
  noFirmaId = (await prisma.user.create({ data: { email: `nf-${s}@x.do`, name: "Sin Firma", role: "ADMIN", companyId, passwordHash: "x" } })).id;
  outsiderId = (await prisma.user.create({ data: { email: `out-${s}@x.do`, name: "Out", role: "MANAGER", companyId: outCompanyId, passwordHash: "x" } })).id;
  projectId = (await prisma.project.create({ data: { companyId, name: `Inf Obra ${s}`, registrationCode: generateRegistrationCode() } })).id;
});

afterAll(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  await prisma.informe.deleteMany({ where: { projectId } });
  await prisma.project.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId: { in: [companyId, outCompanyId] } } });
  await prisma.company.deleteMany({ where: { id: { in: [companyId, outCompanyId] } } });
});

describe("createInforme", () => {
  it("persists a generated informe (with its archetype) and returns its id", async () => {
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    generateMock.mockResolvedValue("# Resumen Ejecutivo\nTodo bien.");
    const res = await createInforme(null, fd({ projectId, scopeType: "project", scopeId: projectId, brief: "Informe mensual para el cliente", archetype: "OWNER" }));
    expect(res).toMatchObject({ ok: true });
    const informe = await prisma.informe.findFirstOrThrow({ where: { projectId } });
    expect(informe.contentMd).toContain("Resumen Ejecutivo");
    expect(informe.model).toBe("claude-sonnet-4-6");
    expect(informe.requestedById).toBe(managerId);
    expect(informe.archetype).toBe("OWNER");
  });
  it("fails with a firma-specific error when the requester has no signature", async () => {
    authMock.mockResolvedValue({ user: { id: noFirmaId, companyId, role: "ADMIN" } });
    const res = await createInforme(null, fd({ projectId, scopeType: "project", scopeId: projectId, brief: "x", archetype: "OWNER" }));
    expect(res).toMatchObject({ ok: false, missingFirma: true });
  });
  it("requires a brief", async () => {
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    const res = await createInforme(null, fd({ projectId, scopeType: "project", scopeId: projectId, brief: "  ", archetype: "OWNER" }));
    expect(res).toMatchObject({ ok: false });
    expect((res as { error?: string }).error).toMatch(/describe/i);
  });
  it("requires an archetype (no default/preselect) — missing", async () => {
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    const res = await createInforme(null, fd({ projectId, scopeType: "project", scopeId: projectId, brief: "x" }));
    expect(res).toMatchObject({ ok: false });
    expect((res as { error?: string }).error).toMatch(/audiencia/i);
  });
  it("rejects an invalid/unknown archetype value", async () => {
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    const res = await createInforme(null, fd({ projectId, scopeType: "project", scopeId: projectId, brief: "x", archetype: "NOT_A_REAL_ARCHETYPE" }));
    expect(res).toMatchObject({ ok: false });
    expect((res as { error?: string }).error).toMatch(/audiencia/i);
  });
  it.each(["OWNER", "SENIOR_MANAGEMENT", "PERSONAL_FEEDBACK"])("accepts and persists archetype %s", async (archetype) => {
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    generateMock.mockResolvedValue(`# Resumen Ejecutivo\n${archetype}.`);
    const res = await createInforme(null, fd({ projectId, scopeType: "project", scopeId: projectId, brief: `Informe ${archetype}`, archetype }));
    expect(res).toMatchObject({ ok: true });
    const informeId = (res as { informeId: string }).informeId;
    const informe = await prisma.informe.findUniqueOrThrow({ where: { id: informeId } });
    expect(informe.archetype).toBe(archetype);
  });
  it("cross-tenant project is rejected", async () => {
    authMock.mockResolvedValue({ user: { id: outsiderId, companyId: outCompanyId, role: "MANAGER" } });
    const res = await createInforme(null, fd({ projectId, scopeType: "project", scopeId: projectId, brief: "x", archetype: "OWNER" }));
    expect(res).toMatchObject({ ok: false });
  });
  it("surfaces generator failures as a friendly error", async () => {
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    generateMock.mockRejectedValue(new Error("api down"));
    const res = await createInforme(null, fd({ projectId, scopeType: "project", scopeId: projectId, brief: "y", archetype: "OWNER" }));
    expect(res).toMatchObject({ ok: false });
  });
  it("returns a missing-key error immediately when ANTHROPIC_API_KEY is absent", async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    try {
      delete process.env.ANTHROPIC_API_KEY;
      authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
      const res = await createInforme(null, fd({ projectId, scopeType: "project", scopeId: projectId, brief: "z", archetype: "OWNER" }));
      expect(res).toMatchObject({ ok: false });
      expect((res as { error?: string }).error).toMatch(/clave de API/i);
    } finally {
      process.env.ANTHROPIC_API_KEY = saved;
    }
  });
});
