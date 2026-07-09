import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { generateRegistrationCode } from "@/lib/project/registration-code";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { createChangeRequest, resolveChangeRequest } from "@/app/actions/cambios";

let companyId = "", adminId = "", managerId = "", residentId = "", projectId = "", segmentId = "";

beforeAll(async () => {
  const s = `notif-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `Notif Co ${s}` } })).id;
  adminId = (await prisma.user.create({ data: { email: `admin-${s}@x.do`, name: "Admin", role: "ADMIN", companyId, passwordHash: "x" } })).id;
  managerId = (await prisma.user.create({ data: { email: `mgr-${s}@x.do`, name: "Mgr", role: "MANAGER", companyId, passwordHash: "x" } })).id;
  residentId = (await prisma.user.create({ data: { email: `res-${s}@x.do`, name: "Res", role: "RESIDENT", companyId, passwordHash: "x" } })).id;
  projectId = (await prisma.project.create({ data: { companyId, name: `Notif Project ${s}`, registrationCode: generateRegistrationCode() } })).id;
  await prisma.projectAssignment.create({ data: { projectId, userId: residentId, role: "RESIDENT" } });
  segmentId = (await prisma.segment.create({ data: { projectId, name: "Bloque Notif" } })).id;
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { companyId } });
  await prisma.registro.deleteMany({ where: { partida: { projectId } } });
  await prisma.changeRequestPartida.deleteMany({ where: { changeRequest: { projectId } } });
  await prisma.changeRequestSegment.deleteMany({ where: { segmentId } });
  await prisma.changeAttachment.deleteMany({ where: { changeRequest: { projectId } } });
  await prisma.changeRequest.deleteMany({ where: { projectId } });
  await prisma.projectAssignment.deleteMany({ where: { projectId } });
  await prisma.partida.deleteMany({ where: { projectId } });
  await prisma.segment.deleteMany({ where: { id: segmentId } });
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, managerId, residentId] } } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.$disconnect();
});

beforeEach(() => { authMock.mockReset(); revalidatePathMock.mockReset(); });

function fd(entries: Record<string, string | string[]>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) {
    if (Array.isArray(v)) v.forEach((x) => f.append(k, x));
    else f.set(k, v);
  }
  return f;
}

describe("createChangeRequest notifications", () => {
  it("notifies ADMIN and MANAGER (not the RESIDENT author) when a CR is created", async () => {
    authMock.mockResolvedValue({ user: { id: residentId, companyId, role: "RESIDENT" } });
    await prisma.notification.deleteMany({ where: { companyId } });
    await createChangeRequest(fd({ projectId, title: "Refuerzo extra", segmentIds: [segmentId], reminderDueAt: "2027-01-15T10:00" }));

    const cr = await prisma.changeRequest.findFirstOrThrow({ where: { projectId, title: "Refuerzo extra" } });
    const notifications = await prisma.notification.findMany({ where: { companyId } });

    // One notification per ADMIN/MANAGER in company (2 users: adminId, managerId), not the author
    expect(notifications).toHaveLength(2);
    const recipientIds = notifications.map((n) => n.userId).sort();
    expect(recipientIds).toEqual([adminId, managerId].sort());

    for (const n of notifications) {
      expect(n.type).toBe("cambio.created");
      expect(n.title).toContain(cr.code);
      expect(n.body).toBe("Refuerzo extra");
      expect(n.link).toBe(`/app/projects/${projectId}/cambios/${cr.id}`);
      expect(n.readAt).toBeNull();
      expect(n.companyId).toBe(companyId);
    }
  });

  it("does NOT notify the ADMIN author themselves", async () => {
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
    await prisma.notification.deleteMany({ where: { companyId } });
    await createChangeRequest(fd({ projectId, title: "Admin CR", segmentIds: [segmentId], reminderDueAt: "2027-01-15T10:00" }));

    const notifications = await prisma.notification.findMany({ where: { companyId } });
    const recipientIds = notifications.map((n) => n.userId);
    expect(recipientIds).not.toContain(adminId); // author excluded
    expect(recipientIds).toContain(managerId);    // other manager gets it
  });
});

describe("resolveChangeRequest notifications", () => {
  async function openCR() {
    authMock.mockResolvedValue({ user: { id: residentId, companyId, role: "RESIDENT" } });
    await createChangeRequest(fd({ projectId, title: `T-${Math.random()}`, segmentIds: [segmentId], reminderDueAt: "2027-01-15T10:00" }));
    return prisma.changeRequest.findFirstOrThrow({ orderBy: { createdAt: "desc" }, where: { projectId } });
  }

  it("REJECT notifies the CR author with correct title", async () => {
    const cr = await openCR();
    await prisma.notification.deleteMany({ where: { companyId } });
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    await resolveChangeRequest(fd({ changeRequestId: cr.id, action: "REJECT", resolutionNote: "Fuera de alcance." }));

    const notifications = await prisma.notification.findMany({ where: { companyId, userId: residentId } });
    expect(notifications).toHaveLength(1);
    const [n] = notifications;
    expect(n.type).toBe("cambio.resolved");
    expect(n.title).toContain(cr.code);
    expect(n.title).toContain("rechazada");
    expect(n.body).toContain("Fuera de alcance.");
    expect(n.link).toBe(`/app/projects/${cr.projectId}/cambios/${cr.id}`);
  });

  it("INTEGRATE notifies the CR author with correct title", async () => {
    // create a partida in the segment so integrate can proceed
    const partida = await prisma.partida.create({ data: { projectId, segmentId, name: `P-${Date.now()}` } });
    const cr = await openCR();
    await prisma.notification.deleteMany({ where: { companyId } });
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    await resolveChangeRequest(fd({ changeRequestId: cr.id, action: "INTEGRATE", resolutionNote: "Aprobado" }));

    const notifications = await prisma.notification.findMany({ where: { companyId, userId: residentId } });
    expect(notifications).toHaveLength(1);
    const [n] = notifications;
    expect(n.type).toBe("cambio.resolved");
    expect(n.title).toContain(cr.code);
    expect(n.title).toContain("integrada");
    expect(n.body).toContain("Aprobado");
    expect(n.link).toBe(`/app/projects/${cr.projectId}/cambios/${cr.id}`);

    // cleanup: delete registro entries so afterAll can delete the partida
    await prisma.registro.deleteMany({ where: { partidaId: partida.id } });
    await prisma.changeRequestPartida.deleteMany({ where: { partidaId: partida.id } });
    await prisma.partida.delete({ where: { id: partida.id } });
  });
});
