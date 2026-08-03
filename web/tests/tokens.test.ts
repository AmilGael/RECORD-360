import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  createActivationToken,
  verifyActivationToken,
  hashToken,
  activationUrl,
  consumeActivationTokens,
  createToken,
  verifyToken,
  consumeTokens,
  resetUrl,
} from "@/lib/auth/tokens";
import { Role, TokenPurpose } from "@prisma/client";

const tag = `schema-smoke-${Date.now()}`;

afterAll(async () => {
  await prisma.accessRequest.deleteMany({ where: { email: tag } });
  await prisma.user.deleteMany({ where: { email: { startsWith: tag } } });
  await prisma.company.deleteMany({ where: { name: { startsWith: tag } } });
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

// Everything this helper creates carries the file-level `tag` prefix so the
// single afterAll `startsWith: tag` sweep covers it. It used to name companies
// `tok-co-<suffix>` and users `tok-<suffix>@...`, which afterAll never matched
// — leaking 3 companies + 3 users into the dev DB on EVERY run of this file
// (257 accumulated before the 2026-08-03 cleanup; see
// scripts/cleanup-orphan-tenants.mjs for the sweep that removes strays from
// crashed runs, which no afterAll can prevent).
async function makeUser(suffix: string) {
  const company = await prisma.company.create({ data: { name: `${tag}-co-${suffix}` } });
  const user = await prisma.user.create({
    data: { email: `${tag}-${suffix}@example.com`, name: "Tok", role: Role.ADMIN, companyId: company.id },
  });
  return { user, company };
}

async function mkUser(s: string) {
  const co = await prisma.company.create({ data: { name: `${tag}-${s}` } });
  return prisma.user.create({
    data: { email: `${tag}-${s}@example.com`, name: "T", role: Role.ADMIN, companyId: co.id },
  });
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

  it("consumes tokens so they no longer verify (single-use)", async () => {
    const { user } = await makeUser(`c-${Date.now()}`);
    const raw = await createActivationToken(user.id);
    expect(await verifyActivationToken(raw)).not.toBeNull();
    await prisma.$transaction((tx) => consumeActivationTokens(tx, user.id));
    expect(await verifyActivationToken(raw)).toBeNull();
  });

  it("returns null for an unknown token", async () => {
    expect(await verifyActivationToken("no-such-token")).toBeNull();
  });
});

describe("purpose-parameterized tokens", () => {
  it("rejects a token verified under the wrong purpose (both directions)", async () => {
    const u = await mkUser("purpose-iso");
    const act = await createToken(u.id, TokenPurpose.ACTIVATION);
    const rst = await createToken(u.id, TokenPurpose.PASSWORD_RESET);
    expect(await verifyToken(act, TokenPurpose.PASSWORD_RESET)).toBeNull();
    expect(await verifyToken(rst, TokenPurpose.ACTIVATION)).toBeNull();
    expect(await verifyToken(act, TokenPurpose.ACTIVATION)).not.toBeNull();
    expect(await verifyToken(rst, TokenPurpose.PASSWORD_RESET)).not.toBeNull();
  });

  it("PASSWORD_RESET tokens expire after 2h; ACTIVATION lasts 24h", async () => {
    const u = await mkUser("purpose-ttl");
    const minted = new Date("2026-07-08T12:00:00Z");
    const act = await createToken(u.id, TokenPurpose.ACTIVATION, minted);
    const rst = await createToken(u.id, TokenPurpose.PASSWORD_RESET, minted);
    const at = (h: number) => new Date(minted.getTime() + h * 3600_000);
    expect(await verifyToken(rst, TokenPurpose.PASSWORD_RESET, at(1.9))).not.toBeNull();
    expect(await verifyToken(rst, TokenPurpose.PASSWORD_RESET, at(2.1))).toBeNull();
    expect(await verifyToken(act, TokenPurpose.ACTIVATION, at(23.9))).not.toBeNull();
    expect(await verifyToken(act, TokenPurpose.ACTIVATION, at(24.1))).toBeNull();
  });

  it("consumeTokens only consumes the given purpose", async () => {
    const u = await mkUser("purpose-consume");
    await createToken(u.id, TokenPurpose.ACTIVATION);
    await createToken(u.id, TokenPurpose.PASSWORD_RESET);
    await prisma.$transaction((tx) => consumeTokens(tx, u.id, TokenPurpose.PASSWORD_RESET));
    const rows = await prisma.verificationToken.findMany({ where: { userId: u.id } });
    expect(rows.find((r) => r.purpose === "PASSWORD_RESET")?.consumedAt).not.toBeNull();
    expect(rows.find((r) => r.purpose === "ACTIVATION")?.consumedAt).toBeNull();
  });

  it("resetUrl builds APP_URL/reset/<raw>", () => {
    expect(resetUrl("abc")).toMatch(/\/reset\/abc$/);
  });
});

