import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  bloqueLastActivity,
  entriesByAuthor,
  getProjectAnalytics,
  partidaStatusByBloque,
  photoCoverage,
  requestStats,
  weeklyActivity,
} from "@/lib/analytics/project";
import { calendarDaysOpen, formatWeekLabel, oldestWeekStartUtc, weekStartKeys } from "@/lib/analytics/weeks";
import type { SessionUser } from "@/lib/authz/projects";
import { prisma } from "@/lib/db";
import { generateRegistrationCode } from "@/lib/project/registration-code";
import { APP_TIME_ZONE, zonedWallTimeToUtc } from "@/lib/time/zone";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const NY = "America/New_York";
const s = `an-${Date.now()}-${Math.random().toString(16).slice(2)}`;

let companyId = "", otherCompanyId = "";
let managerId = "", writerId = "", ghostId = "", otherAdminId = "";
let projectId = "", emptyId = "", otherProjectId = "", windowId = "", photoEdgeId = "", rankId = "";
let bloqueA = "", bloqueB = "";
let partidaA = "", partidaB = "", partidaSin = "", partidaDeleted = "", partidaHundred = "";
let windowPartida = "", photoEdgePartida = "", rankPartida = "";
let otherPartida = "";
let rankSecondId = "";

const manager = (): SessionUser => ({ id: managerId, companyId, role: "MANAGER" });
const otherAdmin = (): SessionUser => ({ id: otherAdminId, companyId: otherCompanyId, role: "ADMIN" });

function dummyHash(tag: string) {
  return createHash("sha256").update(tag).digest("hex");
}

async function insertRegistro(opts: {
  partidaId: string;
  authorId: string;
  at: Date;
  text?: string;
  images?: number;
  pdfs?: number;
}) {
  const tag = `${opts.partidaId}:${opts.at.toISOString()}:${Math.random()}`;
  return prisma.registro.create({
    data: {
      partidaId: opts.partidaId,
      authorId: opts.authorId,
      text: opts.text ?? "r",
      serverCreatedAt: opts.at,
      prevHash: dummyHash(`${tag}:prev`),
      hash: dummyHash(`${tag}:hash`),
      attachments: {
        create: [
          ...Array.from({ length: opts.images ?? 0 }, (_, i) => ({
            url: `/api/media/${tag}-i${i}.jpg`,
            sha256: dummyHash(`${tag}:img:${i}`),
            fileType: "IMAGE" as const,
          })),
          ...Array.from({ length: opts.pdfs ?? 0 }, (_, i) => ({
            url: `/api/media/${tag}-p${i}.pdf`,
            sha256: dummyHash(`${tag}:pdf:${i}`),
            fileType: "PDF" as const,
          })),
        ],
      },
    },
  });
}

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `An Co ${s}` } })).id;
  otherCompanyId = (await prisma.company.create({ data: { name: `An Other ${s}` } })).id;
  managerId = (await prisma.user.create({ data: { email: `an-m-${s}@x.do`, name: "Ana Gerente", role: "MANAGER", companyId, passwordHash: "x" } })).id;
  writerId = (await prisma.user.create({ data: { email: `an-w-${s}@x.do`, name: "Luis Residente", role: "RESIDENT", companyId, passwordHash: "x" } })).id;
  rankSecondId = (await prisma.user.create({ data: { email: `an-r2-${s}@x.do`, name: "Zoe Segunda", role: "RESIDENT", companyId, passwordHash: "x" } })).id;
  ghostId = (await prisma.user.create({ data: { email: `an-g-${s}@x.do`, name: "Fantasma", role: "ADMIN", companyId: otherCompanyId, passwordHash: "x" } })).id;
  otherAdminId = (await prisma.user.create({ data: { email: `an-o-${s}@x.do`, name: "Otro Admin", role: "ADMIN", companyId: otherCompanyId, passwordHash: "x" } })).id;

  projectId = (await prisma.project.create({ data: { companyId, name: `An Obra ${s}`, registrationCode: generateRegistrationCode() } })).id;
  emptyId = (await prisma.project.create({ data: { companyId, name: `An Vacía ${s}`, registrationCode: generateRegistrationCode() } })).id;
  otherProjectId = (await prisma.project.create({ data: { companyId: otherCompanyId, name: `An Ajena ${s}`, registrationCode: generateRegistrationCode() } })).id;
  windowId = (await prisma.project.create({ data: { companyId, name: `An Ventana ${s}`, registrationCode: generateRegistrationCode() } })).id;
  photoEdgeId = (await prisma.project.create({ data: { companyId, name: `An Foto ${s}`, registrationCode: generateRegistrationCode() } })).id;
  rankId = (await prisma.project.create({ data: { companyId, name: `An Rank ${s}`, registrationCode: generateRegistrationCode() } })).id;

  bloqueA = (await prisma.segment.create({ data: { projectId, name: "Bloque A", position: 0 } })).id;
  bloqueB = (await prisma.segment.create({ data: { projectId, name: "Bloque B", position: 1, closedAt: new Date() } })).id;
  partidaA = (await prisma.partida.create({ data: { projectId, segmentId: bloqueA, name: "P A", progressPct: 40 } })).id;
  partidaB = (await prisma.partida.create({ data: { projectId, segmentId: bloqueB, name: "P B", progressPct: 0 } })).id;
  partidaSin = (await prisma.partida.create({ data: { projectId, name: "P Sin", progressPct: 10 } })).id;
  partidaDeleted = (await prisma.partida.create({ data: { projectId, segmentId: bloqueA, name: "P Del", progressPct: 50, deletedAt: new Date() } })).id;
  partidaHundred = (await prisma.partida.create({ data: { projectId, segmentId: bloqueA, name: "P 100", progressPct: 100 } })).id;
  windowPartida = (await prisma.partida.create({ data: { projectId: windowId, name: "P Win" } })).id;
  photoEdgePartida = (await prisma.partida.create({ data: { projectId: photoEdgeId, name: "P Foto" } })).id;
  rankPartida = (await prisma.partida.create({ data: { projectId: rankId, name: "P Rank" } })).id;
  otherPartida = (await prisma.partida.create({ data: { projectId: otherProjectId, name: "P Other" } })).id;

  await prisma.partida.update({
    where: { id: partidaB },
    data: { completedAt: new Date(), progressPct: 100 },
  });

  const now = zonedWallTimeToUtc("2026-10-20T12:00:00", APP_TIME_ZONE);
  await insertRegistro({ partidaId: partidaA, authorId: managerId, at: new Date(now.getTime() - 2 * DAY), images: 1 });
  await insertRegistro({ partidaId: partidaA, authorId: writerId, at: new Date(now.getTime() - DAY), pdfs: 1 });
  await insertRegistro({ partidaId: partidaSin, authorId: managerId, at: new Date(now.getTime() - 3 * HOUR), images: 1 });
  await insertRegistro({ partidaId: partidaDeleted, authorId: managerId, at: new Date(now.getTime() - HOUR), images: 1 });
  await insertRegistro({ partidaId: otherPartida, authorId: otherAdminId, at: new Date(now.getTime() - HOUR), images: 2, text: "ajena" });
  await insertRegistro({ partidaId: rankPartida, authorId: writerId, at: new Date(now.getTime() - HOUR), text: "rank-l1" });
  await insertRegistro({ partidaId: rankPartida, authorId: writerId, at: new Date(now.getTime() - 2 * HOUR), text: "rank-l2" });
  await insertRegistro({ partidaId: rankPartida, authorId: managerId, at: new Date(now.getTime() - 3 * HOUR), text: "rank-a" });
  await insertRegistro({ partidaId: rankPartida, authorId: rankSecondId, at: new Date(now.getTime() - 4 * HOUR), text: "rank-z" });
  await insertRegistro({ partidaId: rankPartida, authorId: ghostId, at: new Date(now.getTime() - 5 * HOUR), text: "rank-g" });

  await prisma.changeRequest.create({
    data: { projectId, code: "SC-AN1", title: "Cambio abierto", authorId: managerId, kind: "CHANGE", severity: "IMPORTANT", status: "OPEN" },
  });
  await prisma.changeRequest.create({
    data: {
      projectId, code: "AL-AN1", title: "Alerta crítica", authorId: managerId,
      kind: "ALERT", severity: "CRITICAL", status: "OPEN",
      createdAt: zonedWallTimeToUtc("2026-10-17T08:00:00", APP_TIME_ZONE),
    },
  });
  await prisma.changeRequest.create({
    data: {
      projectId, code: "AL-AN2", title: "Alerta integrada", authorId: managerId,
      kind: "ALERT", severity: "CRITICAL", status: "INTEGRATED",
    },
  });
  await prisma.changeRequest.create({
    data: {
      projectId: otherProjectId, code: "AL-XX", title: "Ajena", authorId: otherAdminId,
      kind: "ALERT", severity: "CRITICAL", status: "OPEN",
    },
  });
});

afterAll(async () => {
  const projectIds = [projectId, emptyId, otherProjectId, windowId, photoEdgeId, rankId].filter(Boolean);
  await prisma.attachment.deleteMany({ where: { registro: { partida: { projectId: { in: projectIds } } } } });
  await prisma.registro.deleteMany({ where: { partida: { projectId: { in: projectIds } } } });
  await prisma.changeRequest.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.partida.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.segment.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
  await prisma.user.deleteMany({ where: { id: { in: [managerId, writerId, rankSecondId, ghostId, otherAdminId] } } });
  await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } });
  await prisma.$disconnect();
});

describe("formatWeekLabel", () => {
  it("formats from UTC calendar parts so the label cannot shift", () => {
    expect(formatWeekLabel("2026-03-08", "es")).toBe("8 mar");
    expect(formatWeekLabel("2026-03-08", "en")).toBe("Mar 8");
  });
});

describe("calendarDaysOpen", () => {
  it("counts whole local days, not instant subtraction", () => {
    const zone = APP_TIME_ZONE;
    const now = zonedWallTimeToUtc("2026-10-20T00:30:00", zone);
    const created = zonedWallTimeToUtc("2026-10-19T23:30:00", zone);
    // 1 hour apart, different local days → 1. Instant diff would be ~0 days.
    expect(calendarDaysOpen(created, now, zone)).toBe(1);
    expect(calendarDaysOpen(now, now, zone)).toBe(0);
  });
});

describe("weeklyActivity", () => {
  const now = zonedWallTimeToUtc("2026-10-20T12:00:00", APP_TIME_ZONE);

  it("returns 12 Monday keys, oldest first, zero-filled", async () => {
    const { weeks } = await weeklyActivity(emptyId, { now, zone: APP_TIME_ZONE });
    expect(weeks).toHaveLength(12);
    expect(weeks.map((w) => w.week)).toEqual(weekStartKeys(now, APP_TIME_ZONE));
    expect(weeks.every((w) => w.n === 0)).toBe(true);
    expect(weeks[0].week).toBe("2026-08-03");
    expect(weeks[11].week).toBe("2026-10-19");
  });

  it("puts Sunday 23:59:59 local in the previous week and Monday 00:00 in the new week", async () => {
    const sunday = zonedWallTimeToUtc("2026-10-18T23:59:59", APP_TIME_ZONE);
    const monday = zonedWallTimeToUtc("2026-10-19T00:00:00", APP_TIME_ZONE);
    await insertRegistro({ partidaId: windowPartida, authorId: managerId, at: sunday, text: "sun-edge" });
    await insertRegistro({ partidaId: windowPartida, authorId: managerId, at: monday, text: "mon-edge" });
    const { weeks } = await weeklyActivity(windowId, { now, zone: APP_TIME_ZONE });
    const byWeek = Object.fromEntries(weeks.map((w) => [w.week, w.n]));
    expect(byWeek["2026-10-12"]).toBe(1);
    expect(byWeek["2026-10-19"]).toBe(1);
  });

  it("New York spring-forward: Sunday after the jump stays in the previous week", async () => {
    const nowNy = zonedWallTimeToUtc("2026-03-10T12:00:00", NY);
    await insertRegistro({
      partidaId: windowPartida, authorId: managerId,
      at: zonedWallTimeToUtc("2026-03-08T23:59:00", NY), text: "ny-spring-sun",
    });
    await insertRegistro({
      partidaId: windowPartida, authorId: managerId,
      at: zonedWallTimeToUtc("2026-03-09T00:00:00", NY), text: "ny-spring-mon",
    });
    const { weeks } = await weeklyActivity(windowId, { now: nowNy, zone: NY });
    const byWeek = Object.fromEntries(weeks.map((w) => [w.week, w.n]));
    expect(byWeek["2026-03-02"]).toBe(1);
    expect(byWeek["2026-03-09"]).toBe(1);
  });

  it("New York fall-back: Sunday 23:59 stays in the previous week", async () => {
    const nowNy = zonedWallTimeToUtc("2026-11-03T12:00:00", NY);
    await insertRegistro({
      partidaId: windowPartida, authorId: managerId,
      at: zonedWallTimeToUtc("2026-11-01T23:59:00", NY), text: "ny-fall-sun",
    });
    await insertRegistro({
      partidaId: windowPartida, authorId: managerId,
      at: zonedWallTimeToUtc("2026-11-02T00:00:00", NY), text: "ny-fall-mon",
    });
    const { weeks } = await weeklyActivity(windowId, { now: nowNy, zone: NY });
    const byWeek = Object.fromEntries(weeks.map((w) => [w.week, w.n]));
    expect(byWeek["2026-10-26"]).toBe(1);
    expect(byWeek["2026-11-02"]).toBe(1);
  });

  it("counts a registro 1 hour inside the 12-week start and excludes 1 hour outside", async () => {
    const since = oldestWeekStartUtc(now, APP_TIME_ZONE);
    await insertRegistro({ partidaId: windowPartida, authorId: managerId, at: new Date(since.getTime() - HOUR), text: "wk-out" });
    await insertRegistro({ partidaId: windowPartida, authorId: managerId, at: new Date(since.getTime() + HOUR), text: "wk-in" });
    const { weeks } = await weeklyActivity(windowId, { now, zone: APP_TIME_ZONE });
    expect(weeks[0].week).toBe("2026-08-03");
    expect(weeks[0].n).toBe(1);
  });

  it("excludes deleted partidas and another tenant", async () => {
    const { weeks } = await weeklyActivity(projectId, { now, zone: APP_TIME_ZONE });
    const total = weeks.reduce((s, w) => s + w.n, 0);
    expect(total).toBe(3);
    const { weeks: other } = await weeklyActivity(otherProjectId, { now, zone: APP_TIME_ZONE });
    expect(other.reduce((s, w) => s + w.n, 0)).toBe(1);
  });
});

describe("photoCoverage", () => {
  const now = zonedWallTimeToUtc("2026-10-20T12:00:00", APP_TIME_ZONE);

  it("counts IMAGE only, overall and per bloque, and omits deleted/foreign rows", async () => {
    const { overall, byBloque } = await photoCoverage(projectId, { now });
    expect(overall).toEqual({ total: 3, withPhoto: 2, pct: 67 });
    const a = byBloque.find((r) => r.segmentId === bloqueA);
    const sin = byBloque.find((r) => r.segmentId === null);
    expect(a).toEqual({ segmentId: bloqueA, total: 2, withPhoto: 1, pct: 50 });
    expect(sin).toEqual({ segmentId: null, total: 1, withPhoto: 1, pct: 100 });
    expect(byBloque.find((r) => r.segmentId === bloqueB)).toBeUndefined();
  });

  it("counts a registro 1 hour inside the 30-day start and excludes 1 hour outside", async () => {
    const since30 = new Date(now.getTime() - 30 * DAY);
    await insertRegistro({ partidaId: photoEdgePartida, authorId: managerId, at: new Date(since30.getTime() - HOUR), text: "30-out", images: 1 });
    await insertRegistro({ partidaId: photoEdgePartida, authorId: managerId, at: new Date(since30.getTime() + HOUR), text: "30-in", images: 1 });
    const { overall } = await photoCoverage(photoEdgeId, { now });
    expect(overall).toEqual({ total: 1, withPhoto: 1, pct: 100 });
  });

  it("is zero on an empty project", async () => {
    const { overall, byBloque } = await photoCoverage(emptyId, { now });
    expect(overall).toEqual({ total: 0, withPhoto: 0, pct: 0 });
    expect(byBloque).toEqual([]);
  });
});

describe("partidaStatusByBloque", () => {
  it("classifies not started, in progress, concluded; 100% open counts as in progress; Sin bloque last-capable; deleted excluded", async () => {
    expect(partidaHundred).toBeTruthy();
    const rows = await partidaStatusByBloque(projectId);
    const a = rows.find((r) => r.segmentId === bloqueA)!;
    const b = rows.find((r) => r.segmentId === bloqueB)!;
    const sin = rows.find((r) => r.segmentId === null)!;
    expect(a).toEqual({ segmentId: bloqueA, notStarted: 0, inProgress: 2, concluded: 0 });
    expect(b).toEqual({ segmentId: bloqueB, notStarted: 0, inProgress: 0, concluded: 1 });
    expect(sin).toEqual({ segmentId: null, notStarted: 0, inProgress: 1, concluded: 0 });
    expect(rows.find((r) => r.segmentId === bloqueA)!.inProgress).toBe(2); // P A at 40 and P 100 open
  });

  it("is empty on an empty project", async () => {
    expect(await partidaStatusByBloque(emptyId)).toEqual([]);
  });

  it("excludes another tenant", async () => {
    const rows = await partidaStatusByBloque(otherProjectId);
    expect(rows).toEqual([{ segmentId: null, notStarted: 1, inProgress: 0, concluded: 0 }]);
  });
});

describe("requestStats", () => {
  const now = zonedWallTimeToUtc("2026-10-20T12:00:00", APP_TIME_ZONE);

  it("counts OPEN by kind and severity, whole days open on alerts, ignores integrated and other tenants", async () => {
    const stats = await requestStats(projectId, { now, zone: APP_TIME_ZONE });
    expect(stats.open).toBe(2);
    expect(stats.criticalAlerts).toBe(1);
    expect(stats.byKindSeverity).toEqual(expect.arrayContaining([
      { kind: "CHANGE", severity: "IMPORTANT", n: 1 },
      { kind: "ALERT", severity: "CRITICAL", n: 1 },
    ]));
    expect(stats.openAlerts).toHaveLength(1);
    expect(stats.openAlerts[0].code).toBe("AL-AN1");
    expect(stats.openAlerts[0].daysOpen).toBe(3);
  });
});

describe("bloqueLastActivity", () => {
  it("returns the last registro time per bloque as a UTC instant, including Sin bloque, excluding deleted", async () => {
    const rows = await bloqueLastActivity(projectId);
    const a = rows.find((r) => r.segmentId === bloqueA)!;
    const sin = rows.find((r) => r.segmentId === null)!;
    expect(a.lastAt).toBeInstanceOf(Date);
    expect(sin.lastAt).toBeInstanceOf(Date);
    expect(rows.find((r) => r.segmentId === bloqueB)).toBeUndefined();
    const now = zonedWallTimeToUtc("2026-10-20T12:00:00", APP_TIME_ZONE);
    expect(a.lastAt!.getTime()).toBe(now.getTime() - DAY);
    expect(sin.lastAt!.getTime()).toBe(now.getTime() - 3 * HOUR);
  });
});

describe("entriesByAuthor", () => {
  const now = zonedWallTimeToUtc("2026-10-20T12:00:00", APP_TIME_ZONE);

  it("ranks the last 30 days, resolves names only in the viewer's company, ties by authorId", async () => {
    const rows = await entriesByAuthor(rankId, manager(), { now });
    expect(rows[0]).toEqual({ authorId: writerId, name: "Luis Residente", n: 2 });
    const tied = rows.filter((r) => r.n === 1);
    const tiedIds = tied.map((r) => r.authorId);
    expect(tiedIds).toEqual([...tiedIds].sort());
    const ghost = rows.find((r) => r.authorId === ghostId);
    expect(ghost).toEqual({ authorId: ghostId, name: null, n: 1 });
    expect(rows.find((r) => r.authorId === managerId)?.name).toBe("Ana Gerente");
    expect(rows.find((r) => r.authorId === rankSecondId)?.name).toBe("Zoe Segunda");
  });

  it("is empty on an empty project", async () => {
    expect(await entriesByAuthor(emptyId, manager(), { now })).toEqual([]);
  });
});

describe("getProjectAnalytics", () => {
  const now = zonedWallTimeToUtc("2026-10-20T12:00:00", APP_TIME_ZONE);

  it("returns null for another tenant", async () => {
    expect(await getProjectAnalytics(otherAdmin(), projectId, { now })).toBeNull();
  });

  it("returns zeros on an empty project the viewer can access", async () => {
    const data = await getProjectAnalytics(manager(), emptyId, { now, zone: APP_TIME_ZONE });
    expect(data).not.toBeNull();
    expect(data!.weekly.weeks).toHaveLength(12);
    expect(data!.weekly.last7Days).toBe(0);
    expect(data!.photo.overall.pct).toBe(0);
    expect(data!.status).toEqual([]);
    expect(data!.requests.open).toBe(0);
    expect(data!.requests.openAlerts).toEqual([]);
    expect(data!.lastActivity).toEqual([]);
    expect(data!.authors).toEqual([]);
  });
});
