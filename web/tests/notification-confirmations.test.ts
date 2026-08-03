import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { notifyEvent } from "@/lib/notifications/events";
import { generateRegistrationCode } from "@/lib/project/registration-code";

let companyId = "";
let actorId = "";
let managerId = "";
let projectId = "";

beforeAll(async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `Confirm Co ${suffix}` } })).id;
  actorId = (await prisma.user.create({
    data: {
      companyId,
      email: `confirm-actor-${suffix}@x.do`,
      name: "Creator",
      role: "ADMIN",
      passwordHash: "x",
    },
  })).id;
  managerId = (await prisma.user.create({
    data: {
      companyId,
      email: `confirm-manager-${suffix}@x.do`,
      name: "Manager",
      role: "MANAGER",
      passwordHash: "x",
    },
  })).id;
  projectId = (await prisma.project.create({
    data: { companyId, name: `Confirm Project ${suffix}`, registrationCode: generateRegistrationCode() },
  })).id;
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { companyId } });
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.user.deleteMany({ where: { id: { in: [actorId, managerId] } } });
  await prisma.company.deleteMany({ where: { id: companyId } });
});

describe("creator-facing notification confirmations", () => {
  it("includes the actor when a creation event opts into confirmation", async () => {
    const count = await notifyEvent({
      key: "block.created",
      companyId,
      actorId,
      includeActor: true,
      projectId,
      title: "Bloque creado",
      link: `/app/projects/${projectId}`,
    });

    expect(count).toBe(2);
    const recipients = await prisma.notification.findMany({
      where: { companyId, eventKey: "block.created" },
      select: { userId: true },
      orderBy: { userId: "asc" },
    });
    expect(recipients.map((n) => n.userId).sort()).toEqual([actorId, managerId].sort());
  });

  it("keeps excluding the actor for ordinary events", async () => {
    const count = await notifyEvent({
      key: "block.closed",
      companyId,
      actorId,
      projectId,
      title: "Bloque cerrado",
    });

    expect(count).toBe(1);
    const recipients = await prisma.notification.findMany({
      where: { companyId, eventKey: "block.closed" },
      select: { userId: true },
    });
    expect(recipients).toEqual([{ userId: managerId }]);
  });
});

// Regression: resolveRecipients applied the anti-noise actor filter to an
// EXPLICIT recipientIds list as well as to the default stakeholder policy.
// resolveReminder and resolveChangeRequest both union the author into
// recipientIds precisely so the author can never miss a resolution — and that
// union was silently stripped whenever the author was also the actor, which is
// the normal case for a single-admin company. The observable symptom was "these
// actions do not generate notifications at all".
describe("explicit recipientIds", () => {
  it("notifies an explicitly listed recipient who is also the actor", async () => {
    const count = await notifyEvent({
      key: "reminder.resolved",
      companyId,
      actorId,
      projectId,
      title: "Recordatorio resuelto",
      recipientIds: [actorId],
    });

    expect(count).toBe(1);
    const recipients = await prisma.notification.findMany({
      where: { companyId, eventKey: "reminder.resolved" },
      select: { userId: true },
    });
    expect(recipients).toEqual([{ userId: actorId }]);
  });

  it("still refuses to cross a company boundary or notify a disabled user", async () => {
    const outsiderCompanyId = (await prisma.company.create({ data: { name: `Outsider Co ${actorId}` } })).id;
    const outsiderId = (await prisma.user.create({
      data: { companyId: outsiderCompanyId, email: `outsider-${actorId}@x.do`, name: "Outsider", role: "ADMIN", passwordHash: "x" },
    })).id;
    const disabledId = (await prisma.user.create({
      data: { companyId, email: `disabled-${actorId}@x.do`, name: "Disabled", role: "MANAGER", passwordHash: "x", disabledAt: new Date() },
    })).id;

    const count = await notifyEvent({
      key: "request.resolved",
      companyId,
      actorId,
      projectId,
      title: "Solicitud resuelta",
      recipientIds: [actorId, outsiderId, disabledId],
    });

    // Only the actor survives: honoring an explicit list must not weaken tenant
    // isolation or resurrect disabled accounts.
    expect(count).toBe(1);
    const recipients = await prisma.notification.findMany({
      where: { companyId, eventKey: "request.resolved" },
      select: { userId: true },
    });
    expect(recipients).toEqual([{ userId: actorId }]);

    await prisma.user.deleteMany({ where: { id: { in: [outsiderId, disabledId] } } });
    await prisma.company.deleteMany({ where: { id: outsiderCompanyId } });
  });
});
