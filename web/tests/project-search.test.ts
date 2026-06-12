import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { searchProject } from "@/lib/project/search";
import { appendRegistro } from "@/lib/registro/append";
import { generateRegistrationCode } from "@/lib/project/registration-code";

let companyId = "", outCompanyId = "", managerId = "", outsiderId = "", projectId = "", partidaId = "";

beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `PS Co ${s}` } })).id;
  outCompanyId = (await prisma.company.create({ data: { name: `PS Out ${s}` } })).id;
  managerId = (await prisma.user.create({ data: { email: `mgr-${s}@x.do`, name: "Mgr PS", role: "MANAGER", companyId, passwordHash: "x" } })).id;
  outsiderId = (await prisma.user.create({ data: { email: `out-${s}@x.do`, name: "Out", role: "MANAGER", companyId: outCompanyId, passwordHash: "x" } })).id;
  projectId = (await prisma.project.create({ data: { companyId, name: `PS Obra ${s}`, registrationCode: generateRegistrationCode() } })).id;
  partidaId = (await prisma.partida.create({ data: { projectId, name: "Plomeria nivel 3" } })).id;
  await appendRegistro({ partidaId, authorId: managerId, text: "Fuga de agua reparada en plomeria", category: null, progressPct: null, gpsLat: null, gpsLng: null, locationId: null, attachments: [] } as Parameters<typeof appendRegistro>[0]);
  await prisma.document.create({ data: { projectId, kind: "PLANO", title: "Plano plomeria sanitaria", url: "/api/media/ps-doc.pdf", sha256: "x", fileType: "PDF", uploadedById: managerId } });
  await prisma.changeRequest.create({ data: { projectId, code: "SC-PS1", title: "Cambiar tuberia de plomeria", authorId: managerId, reminderDueAt: new Date("2027-01-01") } });
});

afterAll(async () => {
  await prisma.changeRequest.deleteMany({ where: { projectId } });
  await prisma.document.deleteMany({ where: { projectId } });
  await prisma.registro.deleteMany({ where: { partidaId } });
  await prisma.partida.deleteMany({ where: { projectId } });
  await prisma.project.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId: { in: [companyId, outCompanyId] } } });
  await prisma.company.deleteMany({ where: { id: { in: [companyId, outCompanyId] } } });
});

const mgr = () => ({ id: managerId, companyId, role: "MANAGER" as const });

describe("searchProject", () => {
  it("matches across partidas, registros, documentos and cambios, case-insensitive", async () => {
    const r = await searchProject(mgr(), projectId, "PLOMERIA");
    expect(r!.partidas.map((p) => p.name)).toContain("Plomeria nivel 3");
    expect(r!.registros[0]!.text).toContain("plomeria");
    expect(r!.documentos[0]!.title).toContain("plomeria");
    expect(r!.cambios[0]!.title).toContain("plomeria");
  });
  it("no match → empty groups, never null for accessible project", async () => {
    const r = await searchProject(mgr(), projectId, "inexistente-xyz");
    expect(r).toEqual({ partidas: [], registros: [], documentos: [], cambios: [] });
  });
  it("blank query → empty groups (no full dump)", async () => {
    const r = await searchProject(mgr(), projectId, "   ");
    expect(r).toEqual({ partidas: [], registros: [], documentos: [], cambios: [] });
  });
  it("cross-tenant → null", async () => {
    const r = await searchProject({ id: outsiderId, companyId: outCompanyId, role: "MANAGER" }, projectId, "plomeria");
    expect(r).toBeNull();
  });
});
