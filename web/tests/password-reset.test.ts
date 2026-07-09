import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const sendMock = vi.hoisted(() => vi.fn());

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
vi.mock("@/lib/email", () => ({ mailer: { send: sendMock }, sendBestEffort: sendMock }));

import { resetUserPassword } from "@/app/actions/admin";

let s = "";
let companyId = "";
let otherCompanyId = "";
let adminId = "";
let memberId = "";
let residentId = "";
let otherCompanyUserId = "";
let unactivatedId = "";

beforeAll(async () => {
  s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  companyId = (await prisma.company.create({ data: { name: `PwReset Co ${s}` } })).id;
  otherCompanyId = (await prisma.company.create({ data: { name: `Other Co ${s}` } })).id;

  adminId = (
    await prisma.user.create({
      data: { email: `admin-${s}@x.do`, name: "Admin", role: "ADMIN", companyId, passwordHash: "x", emailVerifiedAt: new Date() },
    })
  ).id;

  memberId = (
    await prisma.user.create({
      data: { email: `member-${s}@x.do`, name: "Member", role: "RESIDENT", companyId, passwordHash: "x", emailVerifiedAt: new Date() },
    })
  ).id;

  residentId = (
    await prisma.user.create({
      data: { email: `resident-${s}@x.do`, name: "Resident", role: "RESIDENT", companyId, passwordHash: "x", emailVerifiedAt: new Date() },
    })
  ).id;

  otherCompanyUserId = (
    await prisma.user.create({
      data: { email: `other-${s}@x.do`, name: "Other", role: "ADMIN", companyId: otherCompanyId, passwordHash: "x", emailVerifiedAt: new Date() },
    })
  ).id;

  unactivatedId = (
    await prisma.user.create({
      data: { email: `unactivated-${s}@x.do`, name: "Unactivated", role: "RESIDENT", companyId, emailVerifiedAt: null },
    })
  ).id;
});

afterAll(async () => {
  await prisma.verificationToken.deleteMany({ where: { user: { email: { contains: s } } } });
  await prisma.auditLog.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, memberId, residentId, unactivatedId] } } });
  await prisma.user.deleteMany({ where: { id: otherCompanyUserId } });
  await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } });
  await prisma.$disconnect();
});

beforeEach(() => {
  authMock.mockReset();
  revalidatePathMock.mockReset();
  cookieSetMock.mockReset();
  sendMock.mockReset();
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

describe("resetUserPassword (link-based)", () => {
  it("mints a PASSWORD_RESET token and emails a /reset/ link — passwordHash is NOT changed", async () => {
    asAdmin();
    const before = await prisma.user.findUniqueOrThrow({ where: { id: memberId } });
    await resetUserPassword(fd(memberId));
    const after = await prisma.user.findUniqueOrThrow({ where: { id: memberId } });
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(await prisma.verificationToken.count({
      where: { userId: memberId, purpose: "PASSWORD_RESET", consumedAt: null },
    })).toBe(1);
    expect(sendMock).toHaveBeenCalledOnce();
    const msg = sendMock.mock.calls[0][0];
    expect(msg.text).toMatch(/\/reset\//);
    expect(msg.text).not.toMatch(/contraseña temporal/i);
  });

  it("flashes the reset-sent cookie (never a password)", async () => {
    asAdmin();
    await resetUserPassword(fd(memberId));
    expect(cookieSetMock).toHaveBeenCalledOnce();
    const [name, value] = cookieSetMock.mock.calls[0];
    expect(name).toBe("r360_reset_sent");
    expect(value).toBe("1");
  });

  it("writes an audit log row with action user.password_reset", async () => {
    asAdmin();
    await resetUserPassword(fd(memberId));
    const log = await prisma.auditLog.findFirst({
      where: { actorId: adminId, targetId: memberId, action: "user.password_reset" },
      orderBy: { createdAt: "desc" },
    });
    expect(log).not.toBeNull();
  });

  it("refuses an unactivated target (they must use their activation link)", async () => {
    asAdmin();
    await expect(resetUserPassword(fd(unactivatedId))).rejects.toThrow(/Forbidden/i);
  });

  it("rejects a non-admin caller (RESIDENT)", async () => {
    asResident();
    await expect(resetUserPassword(fd(memberId))).rejects.toThrow(/Forbidden/i);
  });

  it("rejects a cross-tenant target", async () => {
    asAdmin();
    await expect(resetUserPassword(fd(otherCompanyUserId))).rejects.toThrow(/Forbidden|Not found/i);
  });
});
