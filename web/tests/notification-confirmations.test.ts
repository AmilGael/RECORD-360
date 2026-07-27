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
