import { afterAll, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

const redirectMock = vi.hoisted(() => vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }));
const headerGet = vi.hoisted(() => vi.fn().mockReturnValue("8.8.8.8"));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue({ get: headerGet }) }));

import { activateAccount } from "@/app/actions/activation";
import { createActivationToken } from "@/lib/auth/tokens";
import { Role } from "@prisma/client";

const tag = `act-${Date.now()}`;
function fd(o: Record<string, string>) { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; }
async function pendingUser(s: string) {
  const co = await prisma.company.create({ data: { name: `${tag}-${s}` } });
  return prisma.user.create({ data: { email: `${tag}-${s}@x.com`, name: "P", role: Role.ADMIN, companyId: co.id } });
}
afterAll(async () => {
  await prisma.verificationToken.deleteMany({ where: { user: { email: { contains: tag } } } });
  await prisma.user.deleteMany({ where: { email: { contains: tag } } });
  await prisma.company.deleteMany({ where: { name: { contains: tag } } });
  await prisma.loginAttempt.deleteMany({ where: { key: { contains: "activate:" } } });
  await prisma.$disconnect();
});

describe("activateAccount", () => {
  it("sets password + emailVerifiedAt, consumes token, redirects to login", async () => {
    const u = await pendingUser("ok");
    const raw = await createActivationToken(u.id);
    await expect(activateAccount({ status: "idle" }, fd({ token: raw, password: "longpassword12", confirm: "longpassword12" })))
      .rejects.toThrow("REDIRECT:/login?activated=1");
    const after = await prisma.user.findUnique({ where: { id: u.id } });
    expect(after?.emailVerifiedAt).not.toBeNull();
    expect(await bcrypt.compare("longpassword12", after!.passwordHash!)).toBe(true);
    expect(await prisma.verificationToken.count({ where: { userId: u.id, consumedAt: null } })).toBe(0);
  });

  it("rejects a short password", async () => {
    const u = await pendingUser("short");
    const raw = await createActivationToken(u.id);
    expect((await activateAccount({ status: "idle" }, fd({ token: raw, password: "short", confirm: "short" }))).status).toBe("error");
    const after = await prisma.user.findUnique({ where: { id: u.id } });
    expect(after?.emailVerifiedAt).toBeNull();
    expect(after?.passwordHash).toBeNull();
  });

  it("rejects an already-consumed token", async () => {
    const u = await pendingUser("consumed");
    const raw = await createActivationToken(u.id);
    await prisma.verificationToken.updateMany({ where: { userId: u.id }, data: { consumedAt: new Date() } });
    const res = await activateAccount({ status: "idle" }, fd({ token: raw, password: "longpassword12", confirm: "longpassword12" }));
    expect(res.status).toBe("error");
  });

  it("rejects mismatched confirmation", async () => {
    const u = await pendingUser("mm");
    const raw = await createActivationToken(u.id);
    expect((await activateAccount({ status: "idle" }, fd({ token: raw, password: "longpassword12", confirm: "different12345" }))).status).toBe("error");
  });

  it("rejects an invalid token", async () => {
    expect((await activateAccount({ status: "idle" }, fd({ token: "garbage", password: "longpassword12", confirm: "longpassword12" }))).status).toBe("error");
  });
});
