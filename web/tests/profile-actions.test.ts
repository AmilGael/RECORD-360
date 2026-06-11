import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/storage", () => ({
  storage: {
    put: vi.fn(async (f: { contentType: string }) => ({ key: `prof-${f.contentType.split("/")[1]}-test.png`, url: "x" })),
    get: vi.fn(),
  },
}));

import { updateUserProfile, updateCompanySeal } from "@/app/actions/profile";

let companyId = "", otherCompanyId = "", adminId = "", managerId = "", residentId = "", outsiderId = "";

function png(name = "a.png") {
  return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, { type: "image/png" });
}
function jpg() {
  return new File([new Uint8Array([0xff, 0xd8])], "a.jpg", { type: "image/jpeg" });
}

beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `Prof Co ${s}` } })).id;
  otherCompanyId = (await prisma.company.create({ data: { name: `Prof Other ${s}` } })).id;
  adminId = (await prisma.user.create({ data: { email: `adm-${s}@x.do`, name: "Adm", role: "ADMIN", companyId, passwordHash: "x" } })).id;
  managerId = (await prisma.user.create({ data: { email: `mgr-${s}@x.do`, name: "Mgr", role: "MANAGER", companyId, passwordHash: "x" } })).id;
  residentId = (await prisma.user.create({ data: { email: `res-${s}@x.do`, name: "Res", role: "RESIDENT", companyId, passwordHash: "x" } })).id;
  outsiderId = (await prisma.user.create({ data: { email: `out-${s}@x.do`, name: "Out", role: "ADMIN", companyId: otherCompanyId, passwordHash: "x" } })).id;
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { companyId: { in: [companyId, otherCompanyId] } } });
  await prisma.user.deleteMany({ where: { companyId: { in: [companyId, otherCompanyId] } } });
  await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } });
});

function fd(obj: Record<string, string | File>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return f;
}

describe("updateUserProfile", () => {
  it("MANAGER sets phone, photo and firma for a member", async () => {
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    await updateUserProfile(fd({ userId: residentId, phone: "809-555-0101", photo: jpg(), signature: png("firma.png") }));
    const u = await prisma.user.findUniqueOrThrow({ where: { id: residentId } });
    expect(u.phone).toBe("809-555-0101");
    expect(u.photoKey).toBeTruthy();
    expect(u.signatureKey).toBeTruthy();
  });
  it("rejects a non-PNG firma", async () => {
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    await expect(updateUserProfile(fd({ userId: residentId, signature: jpg() }))).rejects.toThrow(/PNG/i);
  });
  it("RESIDENT cannot edit profiles", async () => {
    authMock.mockResolvedValue({ user: { id: residentId, companyId, role: "RESIDENT" } });
    await expect(updateUserProfile(fd({ userId: residentId, phone: "x" }))).rejects.toThrow(/Forbidden/);
  });
  it("cannot edit a user from another company", async () => {
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
    await expect(updateUserProfile(fd({ userId: outsiderId, phone: "x" }))).rejects.toThrow(/Forbidden/);
  });
});

describe("updateCompanySeal", () => {
  it("ADMIN uploads a PNG seal", async () => {
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
    await updateCompanySeal(fd({ seal: png("sello.png") }));
    const c = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    expect(c.sealKey).toBeTruthy();
  });
  it("MANAGER cannot set the seal (ADMIN-only)", async () => {
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    await expect(updateCompanySeal(fd({ seal: png() }))).rejects.toThrow(/Forbidden/);
  });
  it("rejects a JPEG seal", async () => {
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
    await expect(updateCompanySeal(fd({ seal: jpg() }))).rejects.toThrow(/PNG/i);
  });
});
