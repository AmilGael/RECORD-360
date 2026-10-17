import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { assembleReportData } from "@/lib/report/data";
import { appendRegistro } from "@/lib/registro/append";
import { parseRangeParam } from "@/lib/report/params";
import { buildInformeUserMessage } from "@/lib/informes/prompt";
import { generateRegistrationCode } from "@/lib/project/registration-code";

// A date-only report range covers whole days in Santo Domingo. Registros are
// appended through the real ledger with only Date faked, so serverCreatedAt
// lands on chosen instants and the hash chain stays genuine.

let companyId = "", managerId = "", projectId = "", partidaId = "";

const AT = {
  prevEvening: "2026-03-10T03:50:00.000Z", // 23:50 Mar 9 in Santo Domingo
  morning: "2026-03-10T13:00:00.000Z",     // 09:00 Mar 10
  lateEvening: "2026-03-11T02:30:00.000Z", // 22:30 Mar 10
  afterMidnight: "2026-03-11T04:10:00.000Z", // 00:10 Mar 11
};

beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `RZ Co ${s}` } })).id;
  managerId = (await prisma.user.create({ data: { email: `rz-${s}@x.do`, name: "Gerente RZ", role: "MANAGER", companyId, passwordHash: "x" } })).id;
  projectId = (await prisma.project.create({ data: { companyId, name: `RZ Obra ${s}`, registrationCode: generateRegistrationCode() } })).id;
  partidaId = (await prisma.partida.create({ data: { projectId, name: "Rango RZ" } })).id;

  const base = { partidaId, authorId: managerId, category: null, progressPct: null, gpsLat: null, gpsLng: null, locationId: null, attachments: [] };
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    for (const [text, at] of Object.entries(AT)) {
      vi.setSystemTime(new Date(at));
      await appendRegistro({ ...base, text });
    }
  } finally {
    vi.useRealTimers();
  }
});

afterAll(async () => {
  await prisma.registro.deleteMany({ where: { partidaId } });
  await prisma.partida.deleteMany({ where: { id: partidaId } });
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.user.deleteMany({ where: { id: managerId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.$disconnect();
});

const mgr = () => ({ id: managerId, companyId, role: "MANAGER" as const });
const range = (from: string, to: string) => {
  const url = new URL(`http://test/?from=${from}&to=${to}`);
  return { from: parseRangeParam(url, "from") as Date, to: parseRangeParam(url, "to") as Date };
};

describe("report range in APP_TIME_ZONE", () => {
  it("includes 22:30 on the 'to' day and excludes 00:10 the next day", async () => {
    const { from, to } = range("2026-03-10", "2026-03-10");
    const d = await assembleReportData(mgr(), { type: "partida", id: partidaId }, from, to);
    expect(d!.registros.map((r) => r.text)).toEqual(["morning", "lateEvening"]);
  });

  it("starts at local midnight: 23:50 the previous evening is out", async () => {
    const { from, to } = range("2026-03-09", "2026-03-09");
    const d = await assembleReportData(mgr(), { type: "partida", id: partidaId }, from, to);
    expect(d!.registros.map((r) => r.text)).toEqual(["prevEvening"]);
  });

  it("the informe prompt shows the picked period and Santo Domingo times", async () => {
    const { from, to } = range("2026-03-10", "2026-03-10");
    const d = await assembleReportData(mgr(), { type: "partida", id: partidaId }, from, to);
    const msg = buildInformeUserMessage(d!, "brief");
    expect(msg).toContain("PERIODO: 2026-03-10 a 2026-03-10");
    expect(msg).toContain("[2026-03-10 22:30] Gerente RZ @ Rango RZ: lateEvening");
    expect(msg).toContain("[2026-03-10 09:00] Gerente RZ @ Rango RZ: morning");
  });
});
