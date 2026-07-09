import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { generateRegistrationCode, isValidRegistrationCode } from "@/lib/project/registration-code";
import { createProject } from "@/app/actions/admin";

describe("registration codes (Crockford base32, RPH-XXXX-XXXX)", () => {
  it("generates codes in the canonical format", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateRegistrationCode()).toMatch(/^RPH-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    }
  });
  it("never uses ambiguous characters (I, L, O, U)", () => {
    const joined = Array.from({ length: 200 }, generateRegistrationCode).join("");
    expect(joined).not.toMatch(/[ILOU]/);
  });
  it("validates well-formed codes and rejects garbage", () => {
    expect(isValidRegistrationCode(generateRegistrationCode())).toBe(true);
    expect(isValidRegistrationCode("RPH-1234-567I")).toBe(false); // ambiguous char
    expect(isValidRegistrationCode("XXX-1234-5678")).toBe(false);
    expect(isValidRegistrationCode("RPH-1234")).toBe(false);
    expect(isValidRegistrationCode("rph-1234-5678")).toBe(false); // lowercase
  });
  it("is collision-resistant in a small sample", () => {
    const codes = new Set(Array.from({ length: 1000 }, generateRegistrationCode));
    expect(codes.size).toBe(1000);
  });
});

describe("createProject mints an immutable registration code", () => {
  let companyId = "", adminId = "";
  beforeAll(async () => {
    const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    companyId = (await prisma.company.create({ data: { name: `Code Co ${s}` } })).id;
    adminId = (await prisma.user.create({ data: { email: `adm-${s}@x.do`, name: "Adm", role: "ADMIN", companyId, passwordHash: "x" } })).id;
  });
  afterAll(async () => {
    await prisma.project.deleteMany({ where: { companyId } });
    await prisma.user.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
  });

  it("new obras get a canonical code", async () => {
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
    const fd = new FormData();
    fd.set("name", "Obra Certificada");
    await createProject(fd);
    const p = await prisma.project.findFirstOrThrow({ where: { companyId, name: "Obra Certificada" } });
    expect(p.registrationCode).toMatch(/^RPH-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
  });
});
