import { afterAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { verifyCredentials } from "@/lib/auth/credentials";
import { Role } from "@prisma/client";

const tag = `cred-${Date.now()}`;
afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: tag } } });
  await prisma.company.deleteMany({ where: { name: { contains: tag } } });
  await prisma.$disconnect();
});

async function user(suffix: string, data: { passwordHash?: string | null; emailVerifiedAt?: Date | null }) {
  const company = await prisma.company.create({ data: { name: `${tag}-${suffix}` } });
  return prisma.user.create({
    data: {
      email: `${tag}-${suffix}@example.com`,
      name: "U",
      role: Role.ADMIN,
      companyId: company.id,
      passwordHash: data.passwordHash ?? null,
      emailVerifiedAt: data.emailVerifiedAt ?? null,
    },
  });
}

describe("verifyCredentials", () => {
  it("rejects an unactivated user (no password, not verified)", async () => {
    const u = await user("pending", {});
    expect(await verifyCredentials(u.email, "whatever12345")).toBeNull();
  });
  it("accepts an activated user with the right password", async () => {
    const hash = await bcrypt.hash("correcthorse123", 10);
    const u = await user("active", { passwordHash: hash, emailVerifiedAt: new Date() });
    expect((await verifyCredentials(u.email, "correcthorse123"))?.id).toBe(u.id);
  });
  it("rejects the wrong password", async () => {
    const hash = await bcrypt.hash("correcthorse123", 10);
    const u = await user("wrong", { passwordHash: hash, emailVerifiedAt: new Date() });
    expect(await verifyCredentials(u.email, "nope12345678")).toBeNull();
  });
});
