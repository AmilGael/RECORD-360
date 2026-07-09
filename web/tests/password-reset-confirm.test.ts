import { afterAll, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

const redirectMock = vi.hoisted(() => vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }));
const headerGet = vi.hoisted(() => vi.fn().mockReturnValue("6.6.6.6"));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue({ get: headerGet }) }));

import { resetPassword } from "@/app/actions/password-reset";
import { createToken } from "@/lib/auth/tokens";
import { Role, TokenPurpose } from "@prisma/client";

const tag = `pwcnf-${Date.now()}`;
function fd(o: Record<string, string>) { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; }
const call = (token: string, password: string, confirm = password) =>
  resetPassword({ status: "idle" }, fd({ token, password, confirm }));

async function activatedUser(s: string) {
  const co = await prisma.company.create({ data: { name: `${tag}-${s}` } });
  return prisma.user.create({
    data: {
      email: `${tag}-${s}@example.com`, name: "T", role: Role.ADMIN, companyId: co.id,
      passwordHash: await bcrypt.hash("old-password-123", 10), emailVerifiedAt: new Date("2026-01-01"),
    },
  });
}

afterAll(async () => {
  const cos = await prisma.company.findMany({ where: { name: { contains: tag } }, select: { id: true } });
  await prisma.auditLog.deleteMany({ where: { companyId: { in: cos.map((c) => c.id) } } });
  await prisma.verificationToken.deleteMany({ where: { user: { email: { contains: tag } } } });
  await prisma.user.deleteMany({ where: { email: { contains: tag } } });
  await prisma.company.deleteMany({ where: { name: { contains: tag } } });
  await prisma.loginAttempt.deleteMany({ where: { key: { startsWith: "resetpw:" } } });
  await prisma.$disconnect();
});

describe("resetPassword", () => {
  it("sets the new hash, consumes all reset tokens, audits, redirects — and never touches emailVerifiedAt", async () => {
    const u = await activatedUser("ok");
    const raw = await createToken(u.id, TokenPurpose.PASSWORD_RESET);
    await createToken(u.id, TokenPurpose.PASSWORD_RESET); // a second outstanding one
    await expect(call(raw, "brand-new-password-1")).rejects.toThrow("REDIRECT:/login?reset=1");
    const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(await bcrypt.compare("brand-new-password-1", after.passwordHash!)).toBe(true);
    expect(after.emailVerifiedAt?.toISOString()).toBe(new Date("2026-01-01").toISOString());
    expect(await prisma.verificationToken.count({ where: { userId: u.id, consumedAt: null } })).toBe(0);
    const log = await prisma.auditLog.findFirst({ where: { targetId: u.id, action: "user.password_reset_self" } });
    expect(log).not.toBeNull();
  });

  it("rejects reusing a consumed token", async () => {
    const u = await activatedUser("reuse");
    const raw = await createToken(u.id, TokenPurpose.PASSWORD_RESET);
    await expect(call(raw, "brand-new-password-1")).rejects.toThrow("REDIRECT:");
    expect((await call(raw, "another-password-123")).status).toBe("error");
  });

  it("rejects an ACTIVATION token (purpose isolation at the action level)", async () => {
    const u = await activatedUser("purpose");
    const act = await createToken(u.id, TokenPurpose.ACTIVATION);
    expect((await call(act, "brand-new-password-1")).status).toBe("error");
  });

  it("rejects short passwords and mismatched confirmation without consuming the token", async () => {
    const u = await activatedUser("policy");
    const raw = await createToken(u.id, TokenPurpose.PASSWORD_RESET);
    expect((await call(raw, "short")).status).toBe("error");
    expect((await call(raw, "brand-new-password-1", "different-password-1")).status).toBe("error");
    expect(await prisma.verificationToken.count({ where: { userId: u.id, consumedAt: null } })).toBe(1);
  });

  it("rejects a garbage token", async () => {
    expect((await call("garbage", "brand-new-password-1")).status).toBe("error");
  });
});
