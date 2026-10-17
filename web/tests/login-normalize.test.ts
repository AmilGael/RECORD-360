import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";

// next-auth's entry pulls in next/server, which does not load under Vitest. It
// re-exports CredentialsSignin from @auth/core/errors, so hand that same class
// through: LockedOutSignin still extends the real AuthError hierarchy.
vi.mock("next-auth", async () => ({ CredentialsSignin: (await import("@auth/core/errors")).CredentialsSignin }));

import { prisma } from "@/lib/db";
import { normalizeEmail } from "@/lib/auth/email";
import { verifyCredentials } from "@/lib/auth/credentials";
import { authorizeCredentials } from "@/lib/auth/authorize";
import { loginThrottleBlocked, loginThrottleFailure, loginThrottleKey } from "@/lib/auth/login-throttle";
import { CredentialsSignin } from "@auth/core/errors";

const tag = `lognorm-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const PASSWORD = "correcthorse123";
let hash = "";

afterEach(() => { vi.restoreAllMocks(); });
afterAll(async () => {
  await prisma.loginAttempt.deleteMany({ where: { key: { contains: tag } } });
  await prisma.user.deleteMany({ where: { email: { contains: tag, mode: "insensitive" } } });
  await prisma.company.deleteMany({ where: { name: { contains: tag } } });
  await prisma.$disconnect();
});

async function activeUser(email: string) {
  hash ||= await bcrypt.hash(PASSWORD, 10);
  const company = await prisma.company.create({ data: { name: `${tag}-${email}` } });
  return prisma.user.create({
    data: { email, name: "U", role: Role.ADMIN, companyId: company.id, passwordHash: hash, emailVerifiedAt: new Date() },
  });
}

function loginRequest(ip: string) {
  return new Request("http://localhost/api/auth/callback/credentials", { method: "POST", headers: { "x-forwarded-for": ip } });
}

describe("normalizeEmail", () => {
  it("trims and lowercases, and maps null/undefined to an empty string", () => {
    expect(normalizeEmail("  Juan@Example.DO ")).toBe("juan@example.do");
    expect(normalizeEmail(null)).toBe("");
    expect(normalizeEmail(undefined)).toBe("");
  });
});

describe("login email normalization", () => {
  it("logs in a padded, mixed-case email as the stored lowercase account", async () => {
    const u = await activeUser(`juan-${tag}@example.do`);
    const result = await authorizeCredentials({ email: `  Juan-${tag.toUpperCase()}@Example.DO `, password: PASSWORD }, loginRequest("10.0.0.1"));
    expect(result?.id).toBe(u.id);
  });

  it("accepts a single legacy mixed-case row", async () => {
    const u = await activeUser(`Legacy-${tag}@Example.do`);
    expect((await verifyCredentials(`legacy-${tag}@example.do`, PASSWORD))?.id).toBe(u.id);
  });

  it("rejects when two rows differ only by case, and still counts the failure", async () => {
    await activeUser(`Twin-${tag}@example.do`);
    await activeUser(`twin-${tag}@Example.do`);
    const key = `twin-${tag}@example.do|10.0.0.2`;
    expect(await verifyCredentials(`twin-${tag}@example.do`, PASSWORD, key)).toBeNull();
    expect((await prisma.loginAttempt.findUnique({ where: { key } }))?.failures).toBe(1);
  });

  it("runs bcrypt against a dummy hash for an unknown email", async () => {
    const compare = vi.spyOn(bcrypt, "compare");
    expect(await verifyCredentials(`nobody-${tag}@example.do`, PASSWORD)).toBeNull();
    expect(compare).toHaveBeenCalledTimes(1);
  });
});

describe("login lockout", () => {
  it("throws a CredentialsSignin with code 'locked' once the key is blocked, even for an unknown email", async () => {
    const email = `locked-${tag}@example.do`;
    const request = loginRequest("10.0.0.3");
    const key = loginThrottleKey(email, request);
    for (let i = 0; i < 5; i += 1) await loginThrottleFailure(key);
    expect(await loginThrottleBlocked(key)).toBe(true);
    const err = await authorizeCredentials({ email, password: PASSWORD }, request).catch((e) => e);
    expect(err).toBeInstanceOf(CredentialsSignin);
    expect(err.code).toBe("locked");
  });
});
