import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const storagePut = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/storage", () => ({ storage: { put: storagePut, get: vi.fn() } }));

import { createDocument } from "@/app/actions/documents";
import { logRegistro } from "@/app/actions/registro";

let companyId = "", managerId = "", projectId = "", partidaId = "";

beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `MgrUp Co ${s}` } })).id;
  // Deliberately NOT assigned to the project — regression lock: manager can publish company-wide.
  managerId = (await prisma.user.create({ data: { email: `mgr-${s}@x.do`, name: "Gerente", role: "MANAGER", companyId, passwordHash: "x" } })).id;
  projectId = (await prisma.project.create({ data: { companyId, name: `MgrUp Obra ${s}` } })).id;
  partidaId = (await prisma.partida.create({ data: { projectId, name: "Losa N1" } })).id;
});

afterAll(async () => {
  await prisma.document.deleteMany({ where: { projectId } });
  await prisma.attachment.deleteMany({ where: { registro: { partidaId } } });
  await prisma.registro.deleteMany({ where: { partidaId } });
  await prisma.partida.deleteMany({ where: { projectId } });
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
});

describe("unassigned MANAGER can publish content (R0.7 regression lock)", () => {
  it("uploads a document into a space", async () => {
    storagePut.mockResolvedValue({ key: "plano.pdf", url: "/api/media/plano.pdf" });
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });

    const fd = new FormData();
    fd.set("projectId", projectId);
    fd.set("title", "Plano gerente");
    fd.append("file", new File([new Uint8Array(5)], "plano.pdf", { type: "application/pdf" }));

    const res = await createDocument(null, fd);
    expect(res.ok).toBe(true);
    const doc = await prisma.document.findFirstOrThrow({ where: { projectId, uploadedById: managerId } });
    expect(doc.uploadedById).toBe(managerId);
  });

  it("posts a registro in the cuaderno", async () => {
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });

    const fd = new FormData();
    fd.set("partidaId", partidaId);
    fd.set("text", "Nota del gerente");

    const res = await logRegistro(null, fd);
    expect(res.ok).toBe(true);
    const registro = await prisma.registro.findFirstOrThrow({ where: { partidaId, text: "Nota del gerente" } });
    expect(registro.authorId).toBe(managerId);
  });
});
