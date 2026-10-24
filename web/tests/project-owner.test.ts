import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { createProject } from "@/app/actions/admin";
import { rejectedText } from "./helpers/user-message";

describe("createProject ownerName (WS4A)", () => {
  let companyId = "", adminId = "";
  beforeAll(async () => {
    const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    companyId = (await prisma.company.create({ data: { name: `Owner Co ${s}` } })).id;
    adminId = (await prisma.user.create({ data: { email: `adm-${s}@x.do`, name: "Adm", role: "ADMIN", companyId, passwordHash: "x" } })).id;
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
  });
  afterAll(async () => {
    await prisma.project.deleteMany({ where: { companyId } });
    await prisma.user.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
  });

  it("stores a trimmed ownerName when provided", async () => {
    const fd = new FormData();
    fd.set("name", "Obra con Propietario");
    fd.set("ownerName", "  Constructora Ejemplo SRL  ");
    await createProject(fd);
    const p = await prisma.project.findFirstOrThrow({ where: { companyId, name: "Obra con Propietario" } });
    expect(p.ownerName).toBe("Constructora Ejemplo SRL");
  });

  it("leaves ownerName null when omitted (legacy shape)", async () => {
    const fd = new FormData();
    fd.set("name", "Obra sin Propietario");
    await createProject(fd);
    const p = await prisma.project.findFirstOrThrow({ where: { companyId, name: "Obra sin Propietario" } });
    expect(p.ownerName).toBeNull();
  });

  it("rejects an ownerName longer than 120 characters", async () => {
    const fd = new FormData();
    fd.set("name", "Obra Propietario Largo");
    fd.set("ownerName", "x".repeat(121));
    expect(await rejectedText(createProject(fd))).toMatch(/largo/i);
    const p = await prisma.project.findFirst({ where: { companyId, name: "Obra Propietario Largo" } });
    expect(p).toBeNull();
  });

  it("accepts an ownerName at exactly 120 characters", async () => {
    const fd = new FormData();
    fd.set("name", "Obra Propietario Límite");
    fd.set("ownerName", "x".repeat(120));
    await createProject(fd);
    const p = await prisma.project.findFirstOrThrow({ where: { companyId, name: "Obra Propietario Límite" } });
    expect(p.ownerName).toHaveLength(120);
  });
});
