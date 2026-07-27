import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { generateRegistrationCode } from "@/lib/project/registration-code";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { archiveUser, restoreUser } from "@/app/actions/admin";

let companyId = "", otherCompanyId = "", adminId = "", otherAdminId = "", secondAdminId = "";
let projectAId = "", projectBId = "";

beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `Arch User Co ${s}` } })).id;
  otherCompanyId = (await prisma.company.create({ data: { name: `Arch Other Co ${s}` } })).id;
  adminId = (await prisma.user.create({ data: { email: `au-adm-${s}@x.do`, name: "Admin", role: "ADMIN", companyId, passwordHash: "x" } })).id;
  otherAdminId = (await prisma.user.create({ data: { email: `au-oadm-${s}@x.do`, name: "OtherAdmin", role: "ADMIN", companyId: otherCompanyId, passwordHash: "x" } })).id;
  secondAdminId = (await prisma.user.create({ data: { email: `au-mgr-${s}@x.do`, name: "SecondAdminRecipient", role: "ADMIN", companyId, passwordHash: "x" } })).id;
  projectAId = (await prisma.project.create({ data: { companyId, name: `Arch Proj A ${s}`, registrationCode: generateRegistrationCode() } })).id;
  projectBId = (await prisma.project.create({ data: { companyId, name: `Arch Proj B ${s}`, registrationCode: generateRegistrationCode() } })).id;
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { companyId } });
  await prisma.auditLog.deleteMany({ where: { companyId } });
  await prisma.projectAssignment.deleteMany({ where: { project: { companyId } } });
  await prisma.project.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId: { in: [companyId, otherCompanyId] } } });
  await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } });
  await prisma.$disconnect();
});

beforeEach(() => { authMock.mockReset(); revalidatePathMock.mockReset(); });

function fd(userId: string) { const f = new FormData(); f.set("userId", userId); return f; }
const asAdmin = () => authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });

async function makeTarget(s: string) {
  const target = await prisma.user.create({ data: { email: `target-${s}-${Date.now()}@x.do`, name: `Target ${s}`, role: "RESIDENT", companyId, passwordHash: "x" } });
  await prisma.projectAssignment.create({ data: { projectId: projectAId, userId: target.id, role: "RESIDENT" } });
  await prisma.projectAssignment.create({ data: { projectId: projectBId, userId: target.id, role: "RESIDENT" } });
  return target;
}

describe("archiveUser", () => {
  it("sets disabledAt, deletes assignments, writes one audit row, and notifies once per removed assignment", async () => {
    const target = await makeTarget("a");
    asAdmin();
    await archiveUser(fd(target.id));

    const after = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(after.disabledAt).not.toBeNull();

    const assignments = await prisma.projectAssignment.count({ where: { userId: target.id } });
    expect(assignments).toBe(0);

    const audits = await prisma.auditLog.count({ where: { targetId: target.id, action: "user.archived" } });
    expect(audits).toBe(1);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { targetId: target.id, action: "user.archived" } });
    expect((audit.metadata as { assignments: unknown[] }).assignments).toHaveLength(2);

    // One notification per removed assignment (2 projects) to the other company ADMIN.
    const notifs = await prisma.notification.findMany({ where: { companyId, eventKey: "user.archived", userId: secondAdminId, title: `Usuario archivado: ${target.name}` } });
    expect(notifs.length).toBe(2);
    expect(new Set(notifs.map((n) => n.projectId))).toEqual(new Set([projectAId, projectBId]));
  });

  it("is idempotent: archiving an already-archived user is a stable no-op (no duplicate audit/notification)", async () => {
    const target = await makeTarget("b");
    asAdmin();
    await archiveUser(fd(target.id));
    await archiveUser(fd(target.id));

    const audits = await prisma.auditLog.count({ where: { targetId: target.id, action: "user.archived" } });
    expect(audits).toBe(1);
    const notifs = await prisma.notification.count({ where: { companyId, eventKey: "user.archived", title: `Usuario archivado: ${target.name}` } });
    expect(notifs).toBe(2); // still just the first call's notifications
  });

  it("blocks self-archive", async () => {
    asAdmin();
    await expect(archiveUser(fd(adminId))).rejects.toThrow();
    const after = await prisma.user.findUniqueOrThrow({ where: { id: adminId } });
    expect(after.disabledAt).toBeNull();
  });

  it("never leaks existence across tenants", async () => {
    asAdmin();
    await expect(archiveUser(fd(otherAdminId))).rejects.toThrow(/Forbidden/);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: otherAdminId } });
    expect(after.disabledAt).toBeNull();
  });

  it("does not touch historical audit rows (its own audit row remains, no cascade)", async () => {
    const target = await makeTarget("c");
    asAdmin();
    await archiveUser(fd(target.id));
    // Sanity: the write we just made is itself untouched by any later operation.
    const audit = await prisma.auditLog.findFirst({ where: { targetId: target.id, action: "user.archived" } });
    expect(audit).not.toBeNull();
  });
});

describe("restoreUser", () => {
  it("clears disabledAt but does NOT restore assignments", async () => {
    const target = await makeTarget("d");
    asAdmin();
    await archiveUser(fd(target.id));
    await restoreUser(fd(target.id));

    const after = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(after.disabledAt).toBeNull();
    const assignments = await prisma.projectAssignment.count({ where: { userId: target.id } });
    expect(assignments).toBe(0);

    const audit = await prisma.auditLog.findFirst({ where: { targetId: target.id, action: "user.restored" } });
    expect(audit).not.toBeNull();
  });

  it("is idempotent on an already-active user", async () => {
    const target = await makeTarget("e");
    asAdmin();
    await restoreUser(fd(target.id));
    const audits = await prisma.auditLog.count({ where: { targetId: target.id, action: "user.restored" } });
    expect(audits).toBe(0);
  });
});
