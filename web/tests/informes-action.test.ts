import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { generateRegistrationCode } from "@/lib/project/registration-code";

const authMock = vi.hoisted(() => vi.fn());
const generateMock = vi.hoisted(() => vi.fn());
const loadSealMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/report/seal", () => ({ loadCompanySealPng: loadSealMock }));
// Keep the real module's other exports (isCreditExhaustedError) — only the
// network call is stubbed.
vi.mock("@/lib/informes/client", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/informes/client")>()),
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
  loadSealMock.mockResolvedValue(Buffer.from("seal"));
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
  await prisma.notification.deleteMany({ where: { companyId } });
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
  it("does not call Anthropic or persist an informe when the company seal is missing", async () => {
    generateMock.mockClear();
    loadSealMock.mockResolvedValueOnce(null);
    try {
      authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
      const res = await createInforme(null, fd({
        projectId,
        scopeType: "project",
        scopeId: projectId,
        brief: "sin sello",
        archetype: "OWNER",
      }));
      expect(res).toMatchObject({ ok: false, missingSeal: true });
      expect(generateMock).not.toHaveBeenCalled();
      expect(await prisma.informe.count({ where: { projectId, brief: "sin sello" } })).toBe(0);
    } finally {
      loadSealMock.mockResolvedValue(Buffer.from("seal"));
    }
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
  it("deduplicates a resubmitted identical request: one row, one paid generation (M2)", async () => {
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    generateMock.mockClear();
    generateMock.mockResolvedValue("# Resumen Ejecutivo\nIdempotente.");
    const form = () => fd({ projectId, scopeType: "project", scopeId: projectId, brief: "idempotente", archetype: "OWNER" });

    const first = await createInforme(null, form());
    const second = await createInforme(null, form());

    expect(first).toMatchObject({ ok: true });
    expect(second).toMatchObject({ ok: true });
    // Same informe returned, not a second one.
    expect((second as { informeId: string }).informeId).toBe((first as { informeId: string }).informeId);
    expect(await prisma.informe.count({ where: { projectId, brief: "idempotente" } })).toBe(1);
    // The second submission must not have cost another Anthropic call.
    expect(generateMock).toHaveBeenCalledTimes(1);
  });
  it("a genuinely different brief still generates its own informe", async () => {
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    generateMock.mockResolvedValue("# Resumen Ejecutivo\nOtro.");
    const a = await createInforme(null, fd({ projectId, scopeType: "project", scopeId: projectId, brief: "distinto-a", archetype: "OWNER" }));
    const b = await createInforme(null, fd({ projectId, scopeType: "project", scopeId: projectId, brief: "distinto-b", archetype: "OWNER" }));
    expect((a as { informeId: string }).informeId).not.toBe((b as { informeId: string }).informeId);
  });
  it("concurrent identical submissions collapse to one row via the unique index", async () => {
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    generateMock.mockResolvedValue("# Resumen Ejecutivo\nCarrera.");
    const form = () => fd({ projectId, scopeType: "project", scopeId: projectId, brief: "carrera", archetype: "OWNER" });
    // Both start before either has persisted, so both clear the pre-check —
    // exactly the real double-submit window (generation takes 15-32s).
    const [r1, r2] = await Promise.all([createInforme(null, form()), createInforme(null, form())]);
    expect(r1).toMatchObject({ ok: true });
    expect(r2).toMatchObject({ ok: true });
    expect((r1 as { informeId: string }).informeId).toBe((r2 as { informeId: string }).informeId);
    expect(await prisma.informe.count({ where: { projectId, brief: "carrera" } })).toBe(1);
  });
  it("surfaces generator failures as a friendly error", async () => {
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    generateMock.mockRejectedValue(new Error("api down"));
    const res = await createInforme(null, fd({ projectId, scopeType: "project", scopeId: projectId, brief: "y", archetype: "OWNER" }));
    expect(res).toMatchObject({ ok: false });
  });
  it("success notifies the requester (informe.ready), failure notifies with the reason (informe.failed)", async () => {
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    generateMock.mockResolvedValue("# Resumen Ejecutivo\nNotificado.");
    const ok = await createInforme(null, fd({ projectId, scopeType: "project", scopeId: projectId, brief: "notifica-ok", archetype: "OWNER" }));
    expect(ok).toMatchObject({ ok: true, status: "READY" });
    const ready = await prisma.notification.findFirst({ where: { companyId, userId: managerId, eventKey: "informe.ready" } });
    expect(ready).toMatchObject({ severity: "SUCCESS", projectId });
    expect(ready?.link).toContain("tab=informes");

    generateMock.mockRejectedValue(new Error("api down"));
    const bad = await createInforme(null, fd({ projectId, scopeType: "project", scopeId: projectId, brief: "notifica-fail", archetype: "OWNER" }));
    expect(bad).toMatchObject({ ok: false });
    const failed = await prisma.notification.findFirst({ where: { companyId, userId: managerId, eventKey: "informe.failed" } });
    expect(failed).toMatchObject({ severity: "IMPORTANT", projectId });
  });
  it("a fresh PENDING row dedupes: no second generation is started while one is running", async () => {
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    generateMock.mockClear();
    const seeded = await prisma.informe.findFirstOrThrow({ where: { projectId, brief: "idempotente" }, select: { idempotencyKey: true, id: true } });
    await prisma.informe.update({ where: { id: seeded.id }, data: { status: "PENDING", startedAt: new Date(), contentMd: "" } });
    const res = await createInforme(null, fd({ projectId, scopeType: "project", scopeId: projectId, brief: "idempotente", archetype: "OWNER" }));
    expect(res).toMatchObject({ ok: true, status: "PENDING", informeId: seeded.id });
    expect(generateMock).not.toHaveBeenCalled();
  });
  it("a stale PENDING row (orphaned invocation) is reclaimed and retried", async () => {
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    generateMock.mockClear();
    generateMock.mockResolvedValue("# Resumen Ejecutivo\nRecuperado.");
    const seeded = await prisma.informe.findFirstOrThrow({ where: { projectId, brief: "idempotente" }, select: { id: true } });
    await prisma.informe.update({
      where: { id: seeded.id },
      data: { status: "PENDING", contentMd: "", startedAt: new Date(Date.now() - 10 * 60_000) },
    });
    const res = await createInforme(null, fd({ projectId, scopeType: "project", scopeId: projectId, brief: "idempotente", archetype: "OWNER" }));
    expect(res).toMatchObject({ ok: true, status: "READY", informeId: seeded.id });
    expect(generateMock).toHaveBeenCalledTimes(1);
    const row = await prisma.informe.findUniqueOrThrow({ where: { id: seeded.id } });
    expect(row.status).toBe("READY");
    expect(row.contentMd).toContain("Recuperado");
  });
  it("a FAILED row is retried on resubmission", async () => {
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    generateMock.mockRejectedValueOnce(new Error("api down"));
    const first = await createInforme(null, fd({ projectId, scopeType: "project", scopeId: projectId, brief: "reintento", archetype: "OWNER" }));
    expect(first).toMatchObject({ ok: false });
    generateMock.mockResolvedValue("# Resumen Ejecutivo\nSegundo intento.");
    const second = await createInforme(null, fd({ projectId, scopeType: "project", scopeId: projectId, brief: "reintento", archetype: "OWNER" }));
    expect(second).toMatchObject({ ok: true, status: "READY" });
    expect(await prisma.informe.count({ where: { projectId, brief: "reintento" } })).toBe(1);
  });
  it("maps an exhausted credit balance to a saldo message, not the generic retry advice", async () => {
    // Shape observed live from the real API: 400 invalid_request_error, which
    // is neither a 401 nor a 429, so it used to fall through to "Intentalo de
    // nuevo" — advice that can never succeed until the account is topped up.
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    generateMock.mockRejectedValue(
      new Anthropic.APIError(
        400,
        { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits." } },
        '  400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}',
        undefined,
      ),
    );
    const res = await createInforme(null, fd({ projectId, scopeType: "project", scopeId: projectId, brief: "saldo", archetype: "OWNER" }));
    expect(res).toMatchObject({ ok: false });
    expect((res as { error?: string }).error).toMatch(/saldo/i);
    expect((res as { error?: string }).error).not.toMatch(/Intentalo de nuevo/i);
    // Background lifecycle: the attempt leaves a FAILED row carrying the real
    // reason — visible and retryable, never a downloadable/usable informe.
    const failed = await prisma.informe.findFirst({ where: { projectId, brief: "saldo" } });
    expect(failed).toMatchObject({ status: "FAILED" });
    expect(failed?.errorMessage).toMatch(/saldo/i);
    expect(await prisma.informe.count({ where: { projectId, brief: "saldo", status: "READY" } })).toBe(0);
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
