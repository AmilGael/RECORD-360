import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const storagePut = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/storage", () => ({ storage: { put: storagePut, get: vi.fn() } }));

import { createDocument } from "@/app/actions/documents";

let companyId = "", adminId = "", residentId = "", projectId = "";

beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const company = await prisma.company.create({ data: { name: `Doc Co ${s}` } });
  companyId = company.id;
  adminId = (await prisma.user.create({ data: { email: `adm-${s}@x.do`, name: "Adm", role: "ADMIN", companyId, passwordHash: "x" } })).id;
  residentId = (await prisma.user.create({ data: { email: `res-${s}@x.do`, name: "Res", role: "RESIDENT", companyId, passwordHash: "x" } })).id;
  projectId = (await prisma.project.create({ data: { companyId, name: `Doc Project ${s}` } })).id;
});

afterAll(async () => {
  await prisma.document.deleteMany({ where: { projectId } });
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, residentId] } } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.$disconnect();
});

beforeEach(() => {
  authMock.mockReset(); revalidatePathMock.mockReset(); storagePut.mockReset();
  storagePut.mockResolvedValue({ key: "plano.pdf", url: "/api/media/plano.pdf" });
});

function fdWithFile() {
  const fd = new FormData();
  fd.set("projectId", projectId);
  fd.set("title", "Planta arquitectónica");
  fd.append("file", new File([new Uint8Array(5)], "plano.pdf", { type: "application/pdf" }));
  return fd;
}

describe("createDocument", () => {
  it("stores a PLANO document for an admin", async () => {
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
    const res = await createDocument(null, fdWithFile());
    expect(res.ok).toBe(true);
    const doc = await prisma.document.findFirstOrThrow({ where: { projectId, title: "Planta arquitectónica" } });
    expect(doc.kind).toBe("PLANO");
    expect(doc.fileType).toBe("PDF");
    expect(doc.url).toBe("/api/media/plano.pdf");
  });
  it("rejects a resident (role gate, P2 widens this)", async () => {
    authMock.mockResolvedValue({ user: { id: residentId, companyId, role: "RESIDENT" } });
    const res = await createDocument(null, fdWithFile());
    expect(res.ok).toBe(false);
  });
  it("rejects when no file is provided", async () => {
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
    const fd = new FormData(); fd.set("projectId", projectId);
    const res = await createDocument(null, fd);
    expect(res.ok).toBe(false);
  });
});
