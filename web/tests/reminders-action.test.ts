import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { appendRegistro } from "@/lib/registro/append";
import { generateRegistrationCode } from "@/lib/project/registration-code";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { resolveReminder } from "@/app/actions/reminders";

let companyId = "", otherCompanyId = "", managerId = "", adminId = "", otherManagerId = "", projectId = "", partidaId = "";

beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `Rem Co ${s}` } })).id;
  otherCompanyId = (await prisma.company.create({ data: { name: `Rem Other ${s}` } })).id;
  managerId = (await prisma.user.create({ data: { email: `m-${s}@x.do`, name: "M", role: "MANAGER", companyId, passwordHash: "x" } })).id;
  adminId = (await prisma.user.create({ data: { email: `a-${s}@x.do`, name: "A", role: "ADMIN", companyId, passwordHash: "x" } })).id;
  otherManagerId = (await prisma.user.create({ data: { email: `om-${s}@x.do`, name: "OM", role: "MANAGER", companyId: otherCompanyId, passwordHash: "x" } })).id;
  projectId = (await prisma.project.create({ data: { companyId, name: `Rem Project ${s}`, registrationCode: generateRegistrationCode() } })).id;
  partidaId = (await prisma.partida.create({ data: { projectId, name: "P" } })).id;
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { companyId } });
  await prisma.auditLog.deleteMany({ where: { companyId } });
  await prisma.registro.deleteMany({ where: { partidaId } });
  await prisma.partida.deleteMany({ where: { id: partidaId } });
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.user.deleteMany({ where: { id: { in: [managerId, adminId, otherManagerId] } } });
  await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } });
  await prisma.$disconnect();
});

beforeEach(() => { authMock.mockReset(); revalidatePathMock.mockReset(); });
function fd(registroId: string) { const f = new FormData(); f.set("registroId", registroId); return f; }
async function makeReminder() {
  const r = await appendRegistro({ partidaId, authorId: managerId, category: null, text: "rem", progressPct: null, gpsLat: null, gpsLng: null, locationId: null, attachments: [], reminderDueAt: new Date(Date.now() + 86_400_000) });
  return r.id;
}

describe("resolveReminder", () => {
  it("sets reminderResolvedAt for a member with project access", async () => {
    const id = await makeReminder();
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    await resolveReminder(fd(id));
    const after = await prisma.registro.findUniqueOrThrow({ where: { id } });
    expect(after.reminderResolvedAt).not.toBeNull();
  });

  // Regression: resolving drops the item from countPendingItems, which feeds
  // the sidebar badge rendered by app/app/layout.tsx. The action revalidated
  // only the project/partida/pending PAGES, so the badge stayed stale — and
  // even revalidatePath("/app") would not have fixed it, because the default
  // "page" scope leaves the layout instance under /app/partidas/[id] untouched.
  it("revalidates the app shell at layout scope so the pending badge updates", async () => {
    const id = await makeReminder();
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    await resolveReminder(fd(id));
    expect(revalidatePathMock).toHaveBeenCalledWith("/app", "layout");
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/pending");
  });

  it("notifies the author even when the author is the one resolving", async () => {
    const id = await makeReminder(); // authored by managerId
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    await resolveReminder(fd(id));
    const notes = await prisma.notification.findMany({
      where: { companyId, eventKey: "reminder.resolved", userId: managerId },
      select: { id: true },
    });
    expect(notes.length).toBeGreaterThan(0);
  });

  it("rejects a user from another company", async () => {
    const id = await makeReminder();
    authMock.mockResolvedValue({ user: { id: otherManagerId, companyId: otherCompanyId, role: "MANAGER" } });
    await expect(resolveReminder(fd(id))).rejects.toThrow();
    const after = await prisma.registro.findUniqueOrThrow({ where: { id } });
    expect(after.reminderResolvedAt).toBeNull();
  });

  it("rejects a registro that has no reminder", async () => {
    const r = await appendRegistro({ partidaId, authorId: managerId, category: null, text: "no rem", progressPct: null, gpsLat: null, gpsLng: null, locationId: null, attachments: [] });
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    await expect(resolveReminder(fd(r.id))).rejects.toThrow();
  });

  it("writes a reminder.resolved audit entry", async () => {
    const id = await makeReminder();
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
    await resolveReminder(fd(id));

    const audit = await prisma.auditLog.findFirst({ where: { targetId: id, action: "reminder.resolved" } });
    expect(audit).not.toBeNull();
    expect(audit?.actorId).toBe(adminId);
  });

  it("notifies the registro author (not the resolver) when resolved by someone else", async () => {
    const id = await makeReminder(); // authored by managerId
    const authorBefore = await prisma.notification.count({ where: { companyId, userId: managerId, eventKey: "reminder.resolved" } });
    const resolverBefore = await prisma.notification.count({ where: { companyId, userId: adminId, eventKey: "reminder.resolved" } });

    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
    await resolveReminder(fd(id));

    const authorNotifs = await prisma.notification.findMany({ where: { companyId, userId: managerId, eventKey: "reminder.resolved" }, orderBy: { createdAt: "desc" } });
    expect(authorNotifs.length).toBe(authorBefore + 1);
    expect(authorNotifs[0].severity).toBe("SUCCESS");

    const resolverAfter = await prisma.notification.count({ where: { companyId, userId: adminId, eventKey: "reminder.resolved" } });
    expect(resolverAfter).toBe(resolverBefore); // the actor is never notified of their own action
  });

  it("is idempotent: resolving twice does not duplicate audit or notification", async () => {
    const id = await makeReminder();
    const auditsBefore = await prisma.auditLog.count({ where: { targetId: id, action: "reminder.resolved" } });
    const notifsBefore = await prisma.notification.count({ where: { companyId, userId: managerId, eventKey: "reminder.resolved" } });

    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
    await resolveReminder(fd(id));
    await resolveReminder(fd(id));

    const auditsAfter = await prisma.auditLog.count({ where: { targetId: id, action: "reminder.resolved" } });
    expect(auditsAfter).toBe(auditsBefore + 1);
    const notifsAfter = await prisma.notification.count({ where: { companyId, userId: managerId, eventKey: "reminder.resolved" } });
    expect(notifsAfter).toBe(notifsBefore + 1);

    const after = await prisma.registro.findUniqueOrThrow({ where: { id } });
    expect(after.reminderResolvedAt).not.toBeNull();
  });
});
