import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());

// next/headers cookies mock — returns an object with get/set so the action can
// call (await cookies()).set(...) without blowing up in the test environment.
const cookieSetMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ set: cookieSetMock, get: vi.fn() }),
}));

import { resetUserPassword } from "@/app/actions/admin";

let companyId = "";
let otherCompanyId = "";
let adminId = "";
let memberId = "";
let residentId = "";
let otherCompanyUserId = "";

beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  companyId = (await prisma.company.create({ data: { name: `PwReset Co ${s}` } })).id;
  otherCompanyId = (await prisma.company.create({ data: { name: `Other Co ${s}` } })).id;

  adminId = (
    await prisma.user.create({
      data: { email: `admin-${s}@x.do`, name: "Admin", role: "ADMIN", companyId, passwordHash: "x" },
    })
  ).id;

  memberId = (
    await prisma.user.create({
      data: { email: `member-${s}@x.do`, name: "Member", role: "RESIDENT", companyId, passwordHash: "x" },
    })
  ).id;

  residentId = (
    await prisma.user.create({
      data: { email: `resident-${s}@x.do`, name: "Resident", role: "RESIDENT", companyId, passwordHash: "x" },
    })
  ).id;

  otherCompanyUserId = (
    await prisma.user.create({
      data: { email: `other-${s}@x.do`, name: "Other", role: "ADMIN", companyId: otherCompanyId, passwordHash: "x" },
    })
  ).id;
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, memberId, residentId] } } });
  await prisma.user.deleteMany({ where: { id: otherCompanyUserId } });
  await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } });
  await prisma.$disconnect();
});

beforeEach(() => {
  authMock.mockReset();
  revalidatePathMock.mockReset();
  cookieSetMock.mockReset();
});

function fd(userId: string) {
  const f = new FormData();
  f.set("userId", userId);
  return f;
}

const asAdmin = () =>
  authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });

const asResident = () =>
  authMock.mockResolvedValue({ user: { id: residentId, companyId, role: "RESIDENT" } });

describe("resetUserPassword", () => {
  it("changes the target user's passwordHash to a new bcrypt hash", async () => {
    asAdmin();
    const before = await prisma.user.findUniqueOrThrow({ where: { id: memberId } });
    await resetUserPassword(fd(memberId));
    const after = await prisma.user.findUniqueOrThrow({ where: { id: memberId } });
    expect(after.passwordHash).not.toBe(before.passwordHash);
    expect(after.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it("flashes the temp password via the TEMP_PW_COOKIE cookie", async () => {
    asAdmin();
    await resetUserPassword(fd(memberId));
    // The action calls (await cookies()).set(TEMP_PW_COOKIE, tempPassword, {...})
    expect(cookieSetMock).toHaveBeenCalledOnce();
    const [name, value] = cookieSetMock.mock.calls[0];
    expect(name).toBe("r360_temp_pw");
    // The flashed value must actually match what was stored in the DB.
    const user = await prisma.user.findUniqueOrThrow({ where: { id: memberId } });
    const valid = await bcrypt.compare(value, user.passwordHash);
    expect(valid).toBe(true);
  });

  it("writes an audit log row with action user.password_reset", async () => {
    asAdmin();
    await resetUserPassword(fd(memberId));
    const log = await prisma.auditLog.findFirst({
      where: { actorId: adminId, targetId: memberId, action: "user.password_reset" },
      orderBy: { createdAt: "desc" },
    });
    expect(log).not.toBeNull();
    // The password itself must NOT appear in the audit log.
    expect(JSON.stringify(log)).not.toMatch(/base64url|tempPassword/i);
  });

  it("rejects a non-admin caller (RESIDENT)", async () => {
    asResident();
    await expect(resetUserPassword(fd(memberId))).rejects.toThrow(/Forbidden/i);
  });

  it("rejects a cross-tenant target", async () => {
    asAdmin();
    // otherCompanyUserId belongs to a different company than the admin's.
    await expect(resetUserPassword(fd(otherCompanyUserId))).rejects.toThrow(/Forbidden|Not found/i);
  });
});
