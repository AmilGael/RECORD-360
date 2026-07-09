import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { assembleReportData } from "@/lib/report/data";
import { appendRegistro } from "@/lib/registro/append";
import { generateRegistrationCode } from "@/lib/project/registration-code";

let companyId = "", managerId = "", outsiderCompanyId = "", outsiderId = "";
let projectId = "", segmentAId = "", segmentBId = "", partidaA1Id = "", partidaB1Id = "";

// serverCreatedAt is part of computeHash — we cannot mutate it post-create.
// Instead, we capture the real timestamps and build a filter window around them.
let regA1_1ServerCreatedAt: Date; // "Vaciado inicial" in A1
let regA1_2ServerCreatedAt: Date; // "Curado" in A1 (created after the first)

beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `RD Co ${s}` } })).id;
  outsiderCompanyId = (await prisma.company.create({ data: { name: `RD Out ${s}` } })).id;
  managerId = (await prisma.user.create({ data: { email: `mgr-${s}@x.do`, name: "Gerente RD", role: "MANAGER", companyId, passwordHash: "x" } })).id;
  outsiderId = (await prisma.user.create({ data: { email: `out-${s}@x.do`, name: "Out", role: "MANAGER", companyId: outsiderCompanyId, passwordHash: "x" } })).id;
  projectId = (await prisma.project.create({ data: { companyId, name: `RD Obra ${s}`, registrationCode: generateRegistrationCode() } })).id;
  segmentAId = (await prisma.segment.create({ data: { projectId, name: "Bloque A" } })).id;
  segmentBId = (await prisma.segment.create({ data: { projectId, name: "Bloque B" } })).id;
  partidaA1Id = (await prisma.partida.create({ data: { projectId, segmentId: segmentAId, name: "Zapatas A1", progressPct: 40 } })).id;
  partidaB1Id = (await prisma.partida.create({ data: { projectId, segmentId: segmentBId, name: "Muros B1", progressPct: 10 } })).id;

  // serverCreatedAt is hashed — create normally and capture real timestamps.
  // We create A1's two registros first, then B1's.
  const base = { authorId: managerId, category: null, progressPct: null, gpsLat: null, gpsLng: null, locationId: null, attachments: [] };

  const r1 = await appendRegistro({ ...base, partidaId: partidaA1Id, text: "Vaciado inicial" });
  regA1_1ServerCreatedAt = r1.serverCreatedAt;

  // Brief sleep so the two registros land in different milliseconds and the
  // time-range test can isolate exactly one of them.
  await new Promise((res) => setTimeout(res, 20));

  const r2 = await appendRegistro({ ...base, partidaId: partidaA1Id, text: "Curado" });
  regA1_2ServerCreatedAt = r2.serverCreatedAt;

  await appendRegistro({ ...base, partidaId: partidaB1Id, text: "Muro enero" });
});

afterAll(async () => {
  await prisma.registro.deleteMany({ where: { partida: { project: { companyId } } } });
  await prisma.partida.deleteMany({ where: { project: { companyId } } });
  await prisma.segment.deleteMany({ where: { projectId } });
  await prisma.project.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId: { in: [companyId, outsiderCompanyId] } } });
  await prisma.company.deleteMany({ where: { id: { in: [companyId, outsiderCompanyId] } } });
});

const mgr = () => ({ id: managerId, companyId, role: "MANAGER" as const });

describe("assembleReportData — scope", () => {
  it("project scope includes all partidas' registros, newest data complete", async () => {
    const d = await assembleReportData(mgr(), { type: "project", id: projectId }, null, null);
    expect(d).not.toBeNull();
    expect(d!.project.registrationCode).toMatch(/^RPH-/);
    expect(d!.registros.map((r) => r.text)).toEqual(expect.arrayContaining(["Vaciado inicial", "Curado", "Muro enero"]));
    expect(d!.partidas.length).toBe(2);
    expect(d!.scopeLabel).toContain("Obra");
  });
  it("segment scope only includes that bloque's registros", async () => {
    const d = await assembleReportData(mgr(), { type: "segment", id: segmentAId }, null, null);
    expect(d).not.toBeNull();
    expect(d!.registros.map((r) => r.text)).toEqual(expect.arrayContaining(["Vaciado inicial", "Curado"]));
    expect(d!.registros.map((r) => r.text)).not.toContain("Muro enero");
    expect(d!.scopeLabel).toContain("Bloque A");
  });
  it("partida scope narrows to one partida", async () => {
    const d = await assembleReportData(mgr(), { type: "partida", id: partidaB1Id }, null, null);
    expect(d).not.toBeNull();
    expect(d!.registros.map((r) => r.text)).toEqual(["Muro enero"]);
    expect(d!.scopeLabel).toContain("Muros B1");
  });
});

describe("assembleReportData — time range", () => {
  it("from/to filters registros by serverCreatedAt (selects exactly the second A1 registro)", async () => {
    // Build a window that starts 1 ms after the first registro and ends 1 second
    // after the second — guaranteed to contain only "Curado".
    const from = new Date(regA1_1ServerCreatedAt.getTime() + 1);
    const to = new Date(regA1_2ServerCreatedAt.getTime() + 1000);
    const d = await assembleReportData(mgr(), { type: "partida", id: partidaA1Id }, from, to);
    expect(d).not.toBeNull();
    expect(d!.registros.map((r) => r.text)).toEqual(["Curado"]);
  });
});

describe("assembleReportData — tenancy", () => {
  it("outsider company gets null", async () => {
    const d = await assembleReportData({ id: outsiderId, companyId: outsiderCompanyId, role: "MANAGER" }, { type: "project", id: projectId }, null, null);
    expect(d).toBeNull();
  });
  it("author names are resolved", async () => {
    const d = await assembleReportData(mgr(), { type: "partida", id: partidaA1Id }, null, null);
    expect(d!.registros[0]!.authorName).toBe("Gerente RD");
  });
});
