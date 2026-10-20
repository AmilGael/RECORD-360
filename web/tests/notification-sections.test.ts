import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { generateRegistrationCode } from "@/lib/project/registration-code";
import { getNotificationSections } from "@/lib/notifications/sections";

let companyId = "", userId = "", otherUserId = "", projectA = "", projectB = "";

beforeAll(async () => {
  const s = `nsec-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `NSec Co ${s}` } })).id;
  userId = (await prisma.user.create({ data: { email: `nsec-u-${s}@x.do`, name: "U", role: "MANAGER", companyId, passwordHash: "x" } })).id;
  otherUserId = (await prisma.user.create({ data: { email: `nsec-o-${s}@x.do`, name: "O", role: "RESIDENT", companyId, passwordHash: "x" } })).id;
  projectA = (await prisma.project.create({ data: { companyId, name: `NSec A ${s}`, registrationCode: generateRegistrationCode() } })).id;
  projectB = (await prisma.project.create({ data: { companyId, name: `NSec B ${s}`, registrationCode: generateRegistrationCode() } })).id;
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { companyId } });
  await prisma.project.deleteMany({ where: { id: { in: [projectA, projectB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.$disconnect();
});

describe("getNotificationSections", () => {
  it("orders unread by Postgres enum DESC (CRITICAL, IMPORTANT, SUCCESS, null), then createdAt desc", async () => {
    const s = `ord-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const stamp = new Date("2026-10-01T12:00:00.000Z");
    const olderCritical = new Date("2026-10-01T11:00:00.000Z");
    const newerSuccess = new Date("2026-10-01T13:00:00.000Z");
    await prisma.notification.createMany({
      data: [
        { companyId, userId, type: "t", title: `${s} success`, severity: "SUCCESS", createdAt: newerSuccess },
        { companyId, userId, type: "t", title: `${s} important`, severity: "IMPORTANT", createdAt: stamp },
        { companyId, userId, type: "t", title: `${s} critical-old`, severity: "CRITICAL", createdAt: olderCritical },
        { companyId, userId, type: "t", title: `${s} critical-new`, severity: "CRITICAL", createdAt: stamp },
        { companyId, userId, type: "t", title: `${s} null`, severity: null, createdAt: newerSuccess },
        { companyId, userId: otherUserId, type: "t", title: `${s} other`, severity: "CRITICAL", createdAt: newerSuccess },
      ],
    });

    const raw = await prisma.notification.findMany({
      where: { userId, title: { startsWith: s } },
      orderBy: [{ severity: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    });
    expect(raw.map((n) => n.title)).toEqual([
      `${s} critical-new`,
      `${s} critical-old`,
      `${s} important`,
      `${s} success`,
      `${s} null`,
    ]);

    const sections = await getNotificationSections(userId, { q: s }, { unreadPage: 1, readPage: 1, pageSize: 25 });
    expect(sections.unread.items.map((n) => n.title)).toEqual([
      `${s} critical-new`,
      `${s} critical-old`,
      `${s} important`,
      `${s} success`,
      `${s} null`,
    ]);
  });

  it("orders read by createdAt desc, ignoring severity", async () => {
    const s = `rd-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const readAt = new Date();
    await prisma.notification.createMany({
      data: [
        { companyId, userId, type: "t", title: `${s} old-critical`, severity: "CRITICAL", createdAt: new Date("2026-09-01T00:00:00.000Z"), readAt },
        { companyId, userId, type: "t", title: `${s} new-success`, severity: "SUCCESS", createdAt: new Date("2026-09-03T00:00:00.000Z"), readAt },
        { companyId, userId, type: "t", title: `${s} mid-null`, severity: null, createdAt: new Date("2026-09-02T00:00:00.000Z"), readAt },
      ],
    });
    const sections = await getNotificationSections(userId, { q: s }, { unreadPage: 1, readPage: 1, pageSize: 25 });
    expect(sections.read.items.map((n) => n.title)).toEqual([`${s} new-success`, `${s} mid-null`, `${s} old-critical`]);
    expect(sections.unread.total).toBe(0);
  });

  it("paginates unread and read independently", async () => {
    const s = `pg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const readAt = new Date();
    await prisma.notification.createMany({
      data: [
        ...Array.from({ length: 26 }, (_, i) => ({
          companyId, userId, type: "t" as const, title: `${s} unread ${String(i).padStart(2, "0")}`,
          createdAt: new Date(Date.UTC(2026, 5, 1, 0, i)),
        })),
        ...Array.from({ length: 26 }, (_, i) => ({
          companyId, userId, type: "t" as const, title: `${s} read ${String(i).padStart(2, "0")}`,
          createdAt: new Date(Date.UTC(2026, 6, 1, 0, i)),
          readAt,
        })),
      ],
    });

    const page1 = await getNotificationSections(userId, { q: s }, { unreadPage: 1, readPage: 1, pageSize: 25 });
    expect(page1.unread.total).toBe(26);
    expect(page1.read.total).toBe(26);
    expect(page1.unread.items).toHaveLength(25);
    expect(page1.read.items).toHaveLength(25);
    expect(page1.unread.hasOlder).toBe(true);
    expect(page1.read.hasOlder).toBe(true);

    const unreadPage2 = await getNotificationSections(userId, { q: s }, { unreadPage: 2, readPage: 1, pageSize: 25 });
    expect(unreadPage2.unread.items).toHaveLength(1);
    expect(unreadPage2.read.items.map((n) => n.id)).toEqual(page1.read.items.map((n) => n.id));
    const unreadIds = [...page1.unread.items, ...unreadPage2.unread.items].map((n) => n.id);
    expect(new Set(unreadIds).size).toBe(26);
  });

  it("applies non-status filters to both sections and hides the other section for status", async () => {
    const s = `fl-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const readAt = new Date();
    await prisma.notification.createMany({
      data: [
        { companyId, userId, type: "alert.created", eventKey: "alert.created", title: `${s} unread A`, severity: "CRITICAL", projectId: projectA },
        { companyId, userId, type: "alert.created", eventKey: "alert.created", title: `${s} read A`, severity: "CRITICAL", projectId: projectA, readAt },
        { companyId, userId, type: "block.created", eventKey: "block.created", title: `${s} unread B`, projectId: projectB },
        { companyId, userId, type: "alert.created", eventKey: "alert.created", title: `${s} read B`, severity: "IMPORTANT", projectId: projectB, readAt },
      ],
    });

    const both = await getNotificationSections(
      userId,
      { q: s, projectId: projectA, type: "alert.created", severity: "CRITICAL" },
      { unreadPage: 1, readPage: 1, pageSize: 25 },
    );
    expect(both.unread.items.map((n) => n.title)).toEqual([`${s} unread A`]);
    expect(both.read.items.map((n) => n.title)).toEqual([`${s} read A`]);

    const unreadOnly = await getNotificationSections(userId, { q: s, status: "unread" }, { unreadPage: 1, readPage: 1, pageSize: 25 });
    expect(unreadOnly.unread.total).toBe(2);
    expect(unreadOnly.read.total).toBe(0);
    expect(unreadOnly.read.items).toEqual([]);

    const readOnly = await getNotificationSections(userId, { q: s, status: "read" }, { unreadPage: 1, readPage: 1, pageSize: 25 });
    expect(readOnly.read.total).toBe(2);
    expect(readOnly.unread.total).toBe(0);
    expect(readOnly.unread.items).toEqual([]);
  });
});
