import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { generateRegistrationCode } from "@/lib/project/registration-code";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { deleteSegment } from "@/app/actions/admin";
import { rejectedText } from "./helpers/user-message";

let companyId = "", adminId = "", managerId = "", projectId = "";

function fd(segmentId: string) {
  const f = new FormData();
  f.set("segmentId", segmentId);
  return f;
}

beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `SD Co ${s}` } })).id;
  adminId = (await prisma.user.create({ data: { email: `adm-${s}@x.do`, name: "Adm SD", role: "ADMIN", companyId, passwordHash: "x" } })).id;
  managerId = (await prisma.user.create({ data: { email: `mgr-${s}@x.do`, name: "Mgr SD", role: "MANAGER", companyId, passwordHash: "x" } })).id;
  projectId = (await prisma.project.create({ data: { companyId, name: `SD Obra ${s}`, registrationCode: generateRegistrationCode() } })).id;
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { companyId } });
  await prisma.auditLog.deleteMany({ where: { companyId } });
  await prisma.partida.deleteMany({ where: { projectId } });
  await prisma.segment.deleteMany({ where: { projectId } });
  await prisma.project.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
});

describe("deleteSegment", () => {
  it("ADMIN deletes an empty bloque; audit + notification written", async () => {
    const seg = await prisma.segment.create({ data: { projectId, name: "Bloque Vacio" } });
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
    await deleteSegment(fd(seg.id));
    expect(await prisma.segment.findUnique({ where: { id: seg.id } })).toBeNull();
    const audit = await prisma.auditLog.findFirst({ where: { companyId, action: "segment.purge", targetId: seg.id } });
    expect(audit).not.toBeNull();
    const note = await prisma.notification.findFirst({ where: { userId: managerId, type: "delete.permanent", title: { contains: "Bloque Vacio" } } });
    expect(note).not.toBeNull();
  });
  it("refuses when the bloque has partidas (even soft-deleted)", async () => {
    const seg = await prisma.segment.create({ data: { projectId, name: "Bloque Con Partidas" } });
    await prisma.partida.create({ data: { projectId, segmentId: seg.id, name: "P1", deletedAt: new Date() } });
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
    expect(await rejectedText(deleteSegment(fd(seg.id)))).toMatch(/contiene/i);
  });
  it("refuses when documents hang off the bloque", async () => {
    const seg = await prisma.segment.create({ data: { projectId, name: "Bloque Con Docs" } });
    await prisma.document.create({ data: { projectId, segmentId: seg.id, kind: "PLANO", url: "/api/media/sd.pdf", sha256: "x", fileType: "PDF", uploadedById: adminId } });
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
    expect(await rejectedText(deleteSegment(fd(seg.id)))).toMatch(/contiene/i);
    await prisma.document.deleteMany({ where: { segmentId: seg.id } });
  });
  it("MANAGER cannot delete bloques", async () => {
    const seg = await prisma.segment.create({ data: { projectId, name: "Bloque Mgr" } });
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    await expect(deleteSegment(fd(seg.id))).rejects.toThrow(/Forbidden/);
  });
});
