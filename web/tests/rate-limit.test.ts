import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";

const key = `rl-test-${Date.now()}`;
afterAll(async () => { await prisma.loginAttempt.deleteMany({ where: { key } }); await prisma.$disconnect(); });
beforeEach(async () => { await prisma.loginAttempt.deleteMany({ where: { key } }); });

describe("rateLimit", () => {
  it("blocks after exceeding max within the window", async () => {
    for (let i = 0; i < 3; i += 1) expect(await rateLimit(key, 3, 60_000)).toBe(false);
    expect(await rateLimit(key, 3, 60_000)).toBe(true); // 4th call exceeds max=3
  });

  it("resets after the window elapses", async () => {
    const past = new Date(Date.now() - 120_000);
    expect(await rateLimit(key, 1, 60_000, past)).toBe(false);
    expect(await rateLimit(key, 1, 60_000)).toBe(false); // new window
  });
});

describe("clientIp", () => {
  it("prefers x-forwarded-for", () => {
    const h = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    expect(clientIp(h)).toBe("1.2.3.4");
  });
  it("falls back to unknown", () => {
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
