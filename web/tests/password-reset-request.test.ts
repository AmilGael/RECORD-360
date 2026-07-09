import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

const sendMock = vi.hoisted(() => vi.fn());
const headerGet = vi.hoisted(() => vi.fn().mockReturnValue("9.9.9.9"));
vi.mock("@/lib/email", () => ({ mailer: { send: sendMock }, sendBestEffort: sendMock }));
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue({ get: headerGet }) }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => { void fn(); } }));

import { requestPasswordReset } from "@/app/actions/password-reset";
import { Role, TokenPurpose } from "@prisma/client";

const tag = `pwreq-${Date.now()}`;
function fd(o: Record<string, string>) { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; }
const call = (email: string, extra: Record<string, string> = {}) =>
  requestPasswordReset({ status: "idle" }, fd({ email, ...extra }));

async function mkUser(s: string, data: { emailVerifiedAt?: Date | null; disabledAt?: Date | null } = {}) {
  const co = await prisma.company.create({ data: { name: `${tag}-${s}` } });
  return prisma.user.create({
    data: {
      email: `${tag}-${s}@example.com`, name: "T", role: Role.ADMIN, companyId: co.id,
      passwordHash: "x", emailVerifiedAt: data.emailVerifiedAt === undefined ? new Date() : data.emailVerifiedAt,
      disabledAt: data.disabledAt ?? null,
    },
  });
}
const tokenCount = (userId: string) =>
  prisma.verificationToken.count({ where: { userId, purpose: TokenPurpose.PASSWORD_RESET } });

afterAll(async () => {
  await prisma.verificationToken.deleteMany({ where: { user: { email: { contains: tag } } } });
  await prisma.user.deleteMany({ where: { email: { contains: tag } } });
  await prisma.company.deleteMany({ where: { name: { contains: tag } } });
  await prisma.loginAttempt.deleteMany({ where: { key: { startsWith: "reset:" } } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  sendMock.mockReset();
  headerGet.mockReturnValue("9.9.9.9");
  await prisma.loginAttempt.deleteMany({ where: { key: { startsWith: "reset:" } } });
});

describe("requestPasswordReset", () => {
  it("mints a PASSWORD_RESET token and emails a /reset/ link for an eligible account", async () => {
    const u = await mkUser("ok");
    const res = await call(u.email);
    expect(res).toEqual({ status: "sent" });
    expect(await tokenCount(u.id)).toBe(1);
    expect(sendMock).toHaveBeenCalledOnce();
    const msg = sendMock.mock.calls[0][0];
    expect(msg.to).toBe(u.email);
    expect(msg.text).toMatch(/\/reset\//);
  });

  it("returns the identical neutral object for unknown, unactivated, and disabled accounts — and mints nothing", async () => {
    const unact = await mkUser("unact", { emailVerifiedAt: null });
    const disabled = await mkUser("dis", { disabledAt: new Date() });
    const results = await Promise.all([
      call(`${tag}-nobody@example.com`), call(unact.email), call(disabled.email),
    ]);
    for (const r of results) expect(r).toEqual({ status: "sent" });
    expect(await tokenCount(unact.id)).toBe(0);
    expect(await tokenCount(disabled.id)).toBe(0);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("drops honeypot submissions silently", async () => {
    const u = await mkUser("hp");
    const res = await call(u.email, { company_site: "http://spam.example" });
    expect(res).toEqual({ status: "sent" });
    expect(await tokenCount(u.id)).toBe(0);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rate limits the 6th request from one IP within the window", async () => {
    headerGet.mockReturnValue("7.7.7.7");
    for (let i = 0; i < 5; i++) {
      expect((await call(`${tag}-rl-${i}@example.com`)).status).toBe("sent");
    }
    const sixth = await call(`${tag}-rl-5@example.com`);
    expect(sixth.status).toBe("error");
  });

  it("rejects an empty email with an error (before any lookup)", async () => {
    expect((await call("")).status).toBe("error");
  });
});
