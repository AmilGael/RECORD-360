import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { loginThrottleBlocked, loginThrottleFailure, loginThrottleReset } from "@/lib/auth/login-throttle";

const key = `test-login|127.0.0.1|${Date.now()}`;

afterAll(async () => {
  await prisma.loginAttempt.deleteMany({ where: { key } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.loginAttempt.deleteMany({ where: { key } });
});

describe("login throttle", () => {
  it("blocks after repeated failures and clears after reset", async () => {
    expect(await loginThrottleBlocked(key)).toBe(false);
    for (let i = 0; i < 5; i += 1) {
      await loginThrottleFailure(key);
    }
    expect(await loginThrottleBlocked(key)).toBe(true);
    await loginThrottleReset(key);
    expect(await loginThrottleBlocked(key)).toBe(false);
  });
});

