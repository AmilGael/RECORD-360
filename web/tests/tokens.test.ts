import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createActivationToken, verifyActivationToken, hashToken, activationUrl } from "@/lib/auth/tokens";
import { Role } from "@prisma/client";

const tag = `schema-smoke-${Date.now()}`;

afterAll(async () => {
  await prisma.accessRequest.deleteMany({ where: { email: tag } });
  await prisma.$disconnect();
});

describe("access-request schema", () => {
  it("can create and read an AccessRequest with default PENDING status", async () => {
    await prisma.accessRequest.create({
      data: { businessName: "Smoke SRL", contactName: "Smoke", email: tag, phone: "809-000-0000" },
    });
    const found = await prisma.accessRequest.findFirst({ where: { email: tag } });
    expect(found?.status).toBe("PENDING");
  });
});

async function makeUser(suffix: string) {
  const company = await prisma.company.create({ data: { name: `tok-co-${suffix}` } });
  const user = await prisma.user.create({
    data: { email: `tok-${suffix}@example.com`, name: "Tok", role: Role.ADMIN, companyId: company.id },
  });
  return { user, company };
}

describe("activation tokens", () => {
  it("mints a raw token whose sha256 is stored, and verifies it", async () => {
    const { user } = await makeUser(`v-${Date.now()}`);
    const raw = await createActivationToken(user.id);
    const stored = await prisma.verificationToken.findUnique({ where: { tokenHash: hashToken(raw) } });
    expect(stored).not.toBeNull();
    const ok = await verifyActivationToken(raw);
    expect(ok?.userId).toBe(user.id);
  });

  it("rejects expired tokens", async () => {
    const { user } = await makeUser(`x-${Date.now()}`);
    const raw = await createActivationToken(user.id, new Date(Date.now() - 48 * 3600_000));
    expect(await verifyActivationToken(raw)).toBeNull();
  });

  it("builds an absolute activation URL", () => {
    expect(activationUrl("abc")).toMatch(/\/activate\/abc$/);
  });
});

