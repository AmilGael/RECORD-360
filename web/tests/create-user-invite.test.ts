import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { Role } from "@prisma/client";

const authMock = vi.hoisted(() => vi.fn());
const sendMock = vi.hoisted(() => vi.fn());
const revalidateMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/email", () => ({ mailer: { send: sendMock }, sendBestEffort: sendMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidateMock }));

import { createUser } from "@/app/actions/admin";

const tag = `inv-${Date.now()}`;
let companyId = "";
let adminId = "";
function fd(o: Record<string, string>) { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; }

beforeEach(async () => {
  sendMock.mockReset();
  const co = await prisma.company.create({ data: { name: `${tag}-co-${Math.random()}` } });
  companyId = co.id;
  const admin = await prisma.user.create({ data: { email: `${tag}-admin-${Math.random()}@x.com`, name: "A", role: Role.ADMIN, companyId, passwordHash: "x", emailVerifiedAt: new Date() } });
  adminId = admin.id;
  authMock.mockResolvedValue({ user: { id: adminId, companyId, role: Role.ADMIN } });
});
afterAll(async () => {
  await prisma.verificationToken.deleteMany({ where: { user: { email: { contains: tag } } } });
  await prisma.user.deleteMany({ where: { email: { contains: tag } } });
  await prisma.company.deleteMany({ where: { name: { contains: tag } } });
  await prisma.$disconnect();
});

describe("createUser (invite via activation link)", () => {
  it("creates an inactive user and emails an activation link, no password", async () => {
    await createUser(fd({ name: "New", email: `${tag}-new@x.com`, role: "RESIDENT" }));
    const u = await prisma.user.findUnique({ where: { email: `${tag}-new@x.com` } });
    expect(u?.passwordHash).toBeNull();
    expect(u?.emailVerifiedAt).toBeNull();
    expect(await prisma.verificationToken.count({ where: { userId: u!.id } })).toBe(1);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("rejects an attempt to create a SUPERADMIN (privilege escalation)", async () => {
    await expect(createUser(fd({ name: "Esc", email: `${tag}-esc@x.com`, role: "SUPERADMIN" }))).rejects.toThrow();
    expect(await prisma.user.findUnique({ where: { email: `${tag}-esc@x.com` } })).toBeNull();
  });
});
