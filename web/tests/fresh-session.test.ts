import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));

import { requireFreshSession } from "@/lib/auth/session";

let companyId = "";
let userId = "";
const passwordHash = "x";

beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `Fresh Session Co ${s}` } })).id;
  const user = await prisma.user.create({
    data: {
      email: `fresh-${s}@x.do`,
      name: "Fresh Session",
      role: "MANAGER",
      companyId,
      passwordHash,
    },
  });
  userId = user.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.$disconnect();
});

beforeEach(() => {
  authMock.mockReset();
});

function asToken() {
  authMock.mockResolvedValue({ user: { id: userId, companyId, role: "MANAGER" } });
}

describe("requireFreshSession", () => {
  it("returns the current DB-backed user when the token is still valid", async () => {
    asToken();
    const user = await requireFreshSession();
    expect(user.id).toBe(userId);
    expect(user.companyId).toBe(companyId);
    expect(user.role).toBe("MANAGER");
  });

  it("rejects a demoted token when the stored role no longer matches", async () => {
    asToken();
    await prisma.user.update({ where: { id: userId }, data: { role: "RESIDENT" } });
    await expect(requireFreshSession()).rejects.toThrow(/Forbidden/i);
  });

  it("rejects a suspended token when disabledAt is set", async () => {
    asToken();
    await prisma.user.update({ where: { id: userId }, data: { disabledAt: new Date() } });
    await expect(requireFreshSession()).rejects.toThrow(/Forbidden/i);
  });

  it("rejects a deleted token when the user row is gone", async () => {
    asToken();
    await prisma.user.delete({ where: { id: userId } });
    await expect(requireFreshSession()).rejects.toThrow(/Unauthorized/i);
  });
});
