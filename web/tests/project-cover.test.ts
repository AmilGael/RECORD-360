import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/storage", () => ({
  storage: {
    put: vi.fn(async () => ({ key: "cover-test.png", url: "/api/media/cover-test.png" })),
    get: vi.fn(),
  },
}));

import { createProject } from "@/app/actions/admin";

describe("createProject stores a cover image when provided", () => {
  let companyId = "", adminId = "";
  beforeAll(async () => {
    const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    companyId = (await prisma.company.create({ data: { name: `Cover Co ${s}` } })).id;
    adminId = (await prisma.user.create({ data: { email: `adm-${s}@x.do`, name: "Adm", role: "ADMIN", companyId, passwordHash: "x" } })).id;
  });
  afterAll(async () => {
    await prisma.project.deleteMany({ where: { companyId } });
    await prisma.user.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
  });

  it("stores a cover image when provided", async () => {
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
    const fd = new FormData();
    fd.set("name", "Obra con Portada");
    fd.set("cover", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "c.png", { type: "image/png" }));
    await createProject(fd);
    const p = await prisma.project.findFirstOrThrow({ where: { companyId, name: "Obra con Portada" } });
    expect(p.coverImageKey).toBe("cover-test.png");
  });
});
