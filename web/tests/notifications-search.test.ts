import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { buildNotificationWhere } from "@/lib/notifications/query";
import { generateRegistrationCode } from "@/lib/project/registration-code";
import { parseDayBound } from "@/lib/time/zone";

// R3 WS3: server-side (DB-level) search/filter/pagination for the notifications
// page — asserts the where-builder actually narrows the DB query (never
// fetch-all-then-filter), including the legacy `cambio.*` alias matching.

let companyId = "", otherCompanyId = "", userId = "", otherUserId = "", projectA = "", projectB = "";

beforeAll(async () => {
  const s = `ns-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `NS Co ${s}` } })).id;
  otherCompanyId = (await prisma.company.create({ data: { name: `NS Other Co ${s}` } })).id;
  userId = (await prisma.user.create({ data: { email: `ns-u-${s}@x.do`, name: "U", role: "MANAGER", companyId, passwordHash: "x" } })).id;
  otherUserId = (await prisma.user.create({ data: { email: `ns-ou-${s}@x.do`, name: "OU", role: "MANAGER", companyId: otherCompanyId, passwordHash: "x" } })).id;
  projectA = (await prisma.project.create({ data: { companyId, name: `NS Project A ${s}`, registrationCode: generateRegistrationCode() } })).id;
  projectB = (await prisma.project.create({ data: { companyId, name: `NS Project B ${s}`, registrationCode: generateRegistrationCode() } })).id;

  const day = 86_400_000;
  await prisma.notification.createMany({
    data: [
      // matched by q="Bloque"
      { companyId, userId, type: "block.created", eventKey: "block.created", title: "Bloque Norte creado", projectId: projectA, createdAt: new Date(Date.now() - 1 * day) },
      // matched by body q="cimentación"
      { companyId, userId, type: "partida.completed", eventKey: "partida.completed", title: "Partida X concluida", body: "Trabajo de cimentación finalizado", severity: "SUCCESS", projectId: projectA, createdAt: new Date(Date.now() - 2 * day) },
      // canonical request.created row
      { companyId, userId, type: "request.created", eventKey: "request.created", title: "Solicitud SC-1 creada", severity: "IMPORTANT", projectId: projectB, createdAt: new Date(Date.now() - 3 * day), readAt: new Date() },
      // legacy alias row: no eventKey, type carries the old string
      { companyId, userId, type: "cambio.created", title: "Solicitud legada SC-0 creada", severity: "CRITICAL", projectId: projectB, createdAt: new Date(Date.now() - 40 * day) },
      // unrelated event, unread
      { companyId, userId, type: "user.archived", eventKey: "user.archived", title: "Usuario archivado", createdAt: new Date(Date.now() - 5 * day) },
      // another user's notification — must never leak into userId's results
      { companyId, userId: otherUserId /* still same company but different user is fine too */, type: "block.created", eventKey: "block.created", title: "Bloque ajeno", createdAt: new Date() },
      // cross-tenant row — must never leak
      { companyId: otherCompanyId, userId: otherUserId, type: "block.created", eventKey: "block.created", title: "Bloque otra empresa", createdAt: new Date() },
    ],
  });
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { companyId: { in: [companyId, otherCompanyId] } } });
  await prisma.project.deleteMany({ where: { id: { in: [projectA, projectB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
  await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } });
  await prisma.$disconnect();
});

describe("buildNotificationWhere", () => {
  it("scopes strictly to the requesting user (tenant/user isolation)", async () => {
    const rows = await prisma.notification.findMany({ where: buildNotificationWhere(userId, {}) });
    expect(rows.length).toBe(5);
    expect(rows.every((r) => r.userId === userId)).toBe(true);
  });

  it("matches free text across title AND body (q)", async () => {
    const byTitle = await prisma.notification.findMany({ where: buildNotificationWhere(userId, { q: "Bloque Norte" }) });
    expect(byTitle.map((r) => r.title)).toEqual(["Bloque Norte creado"]);

    const byBody = await prisma.notification.findMany({ where: buildNotificationWhere(userId, { q: "cimentación" }) });
    expect(byBody.map((r) => r.title)).toEqual(["Partida X concluida"]);
  });

  it("filters by unread/read status", async () => {
    const unread = await prisma.notification.findMany({ where: buildNotificationWhere(userId, { status: "unread" }) });
    expect(unread.some((r) => r.title === "Solicitud SC-1 creada")).toBe(false);

    const read = await prisma.notification.findMany({ where: buildNotificationWhere(userId, { status: "read" }) });
    expect(read.map((r) => r.title)).toEqual(["Solicitud SC-1 creada"]);
  });

  it("filters by projectId", async () => {
    const rows = await prisma.notification.findMany({ where: buildNotificationWhere(userId, { projectId: projectB }) });
    expect(rows.every((r) => r.projectId === projectB)).toBe(true);
    expect(rows.length).toBe(2);
  });

  it("filters by severity", async () => {
    const rows = await prisma.notification.findMany({ where: buildNotificationWhere(userId, { severity: "CRITICAL" }) });
    expect(rows.map((r) => r.title)).toEqual(["Solicitud legada SC-0 creada"]);
  });

  it("matches legacy cambio.created rows when filtering by the canonical request.created key", async () => {
    const rows = await prisma.notification.findMany({ where: buildNotificationWhere(userId, { type: "request.created" }) });
    const titles = rows.map((r) => r.title).sort();
    expect(titles).toEqual(["Solicitud SC-1 creada", "Solicitud legada SC-0 creada"].sort());
  });

  it("does not cross-match an unrelated canonical key against the legacy alias", async () => {
    const rows = await prisma.notification.findMany({ where: buildNotificationWhere(userId, { type: "block.created" }) });
    expect(rows.map((r) => r.title)).toEqual(["Bloque Norte creado"]);
  });

  it("filters by date range (from/to)", async () => {
    const day = 86_400_000;
    const rows = await prisma.notification.findMany({
      where: buildNotificationWhere(userId, { from: new Date(Date.now() - 3.5 * day), to: new Date(Date.now() - 0.5 * day) }),
    });
    const titles = rows.map((r) => r.title).sort();
    expect(titles).toEqual(["Bloque Norte creado", "Partida X concluida", "Solicitud SC-1 creada"].sort());
  });

  describe("date-only filter values are whole days in Santo Domingo", () => {
    let dayUserId = "";
    beforeAll(async () => {
      const s = `nsd-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      dayUserId = (await prisma.user.create({ data: { email: `ns-day-${s}@x.do`, name: "D", role: "MANAGER", companyId, passwordHash: "x" } })).id;
      await prisma.notification.createMany({
        data: [
          { companyId, userId: dayUserId, type: "block.created", eventKey: "block.created", title: "00:10 del día", createdAt: new Date("2026-03-10T04:10:00.000Z") },
          { companyId, userId: dayUserId, type: "block.created", eventKey: "block.created", title: "23:30 del día", createdAt: new Date("2026-03-11T03:30:00.000Z") },
          { companyId, userId: dayUserId, type: "block.created", eventKey: "block.created", title: "00:10 del siguiente", createdAt: new Date("2026-03-11T04:10:00.000Z") },
          { companyId, userId: dayUserId, type: "block.created", eventKey: "block.created", title: "23:30 del anterior", createdAt: new Date("2026-03-10T03:30:00.000Z") },
        ],
      });
    });
    afterAll(async () => {
      await prisma.notification.deleteMany({ where: { userId: dayUserId } });
      await prisma.user.deleteMany({ where: { id: dayUserId } });
    });

    it("includes 23:30 local on the 'to' day and excludes 00:10 local the next day", async () => {
      const rows = await prisma.notification.findMany({
        where: buildNotificationWhere(dayUserId, { from: parseDayBound("2026-03-10", "start"), to: parseDayBound("2026-03-10", "end") }),
        orderBy: { createdAt: "asc" },
      });
      expect(rows.map((r) => r.title)).toEqual(["00:10 del día", "23:30 del día"]);
    });
  });

  it("combines filters (AND) rather than only the last one applied", async () => {
    const rows = await prisma.notification.findMany({ where: buildNotificationWhere(userId, { projectId: projectB, severity: "IMPORTANT" }) });
    expect(rows.map((r) => r.title)).toEqual(["Solicitud SC-1 creada"]);
  });

  it("paginates correctly at page boundaries (take/skip), matching total count", async () => {
    const where = buildNotificationWhere(userId, {});
    const total = await prisma.notification.count({ where });
    const page1 = await prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: 2, skip: 0 });
    const page2 = await prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: 2, skip: 2 });
    const page3 = await prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: 2, skip: 4 });
    expect(total).toBe(5);
    expect(page1.length + page2.length + page3.length).toBe(5);
    // No overlap across pages.
    const ids = [...page1, ...page2, ...page3].map((r) => r.id);
    expect(new Set(ids).size).toBe(5);
  });
});
