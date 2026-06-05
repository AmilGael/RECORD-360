import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { appendRegistro } from "@/lib/registro/append";
import { verifyChain } from "@/lib/registro/hash";
import { toStored } from "@/lib/registro/map";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { movePartida, renamePartida, renameProject, renameSegment } from "@/app/actions/project-edit";

let companyId = "";
let otherCompanyId = "";
let managerId = "";
let residentId = "";
let projectId = "";
let otherProjectId = "";
let segmentAId = "";
let segmentBId = "";
let otherSegmentId = "";
let partidaId = "";

function fd(entries: Record<string, string | null>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    if (value !== null) form.set(key, value);
  }
  return form;
}

beforeAll(async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `Edit Co ${suffix}` } })).id;
  otherCompanyId = (await prisma.company.create({ data: { name: `Other Edit Co ${suffix}` } })).id;
  managerId = (await prisma.user.create({ data: { email: `edit-m-${suffix}@x.do`, name: "Manager", role: "MANAGER", companyId, passwordHash: "x" } })).id;
  residentId = (await prisma.user.create({ data: { email: `edit-r-${suffix}@x.do`, name: "Resident", role: "RESIDENT", companyId, passwordHash: "x" } })).id;
  projectId = (await prisma.project.create({ data: { companyId, name: "Editable Obra" } })).id;
  otherProjectId = (await prisma.project.create({ data: { companyId: otherCompanyId, name: "Other Project" } })).id;
  segmentAId = (await prisma.segment.create({ data: { projectId, name: "Bloque A" } })).id;
  segmentBId = (await prisma.segment.create({ data: { projectId, name: "Bloque B" } })).id;
  otherSegmentId = (await prisma.segment.create({ data: { projectId: otherProjectId, name: "Other Bloque" } })).id;
  partidaId = (await prisma.partida.create({ data: { projectId, segmentId: segmentAId, name: "Partida original" } })).id;
});

afterAll(async () => {
  await prisma.registro.deleteMany({ where: { partida: { projectId } } });
  await prisma.partida.deleteMany({ where: { projectId: { in: [projectId, otherProjectId] } } });
  await prisma.segment.deleteMany({ where: { projectId: { in: [projectId, otherProjectId] } } });
  await prisma.project.deleteMany({ where: { id: { in: [projectId, otherProjectId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [managerId, residentId] } } });
  await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } });
  await prisma.$disconnect();
});

beforeEach(() => {
  authMock.mockReset();
  revalidatePathMock.mockReset();
  authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
});

describe("project edit actions", () => {
  it("renames a project and writes an audit row", async () => {
    await renameProject(fd({ projectId, name: "Obra Renombrada" }));

    await expect(prisma.project.findUniqueOrThrow({ where: { id: projectId } })).resolves.toMatchObject({ name: "Obra Renombrada" });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { targetType: "Project", targetId: projectId, action: "project.rename" } });
    expect(audit.companyId).toBe(companyId);
    expect(audit.actorId).toBe(managerId);
    expect(audit.summary).toContain("Obra Renombrada");
  });

  it("renames a bloque but rejects a duplicate bloque name", async () => {
    await renameSegment(fd({ segmentId: segmentAId, name: "Bloque Principal" }));
    await expect(prisma.segment.findUniqueOrThrow({ where: { id: segmentAId } })).resolves.toMatchObject({ name: "Bloque Principal" });

    await expect(renameSegment(fd({ segmentId: segmentBId, name: "bloque principal" }))).rejects.toThrow(/bloque/i);
  });

  it("renames a partida without changing the registro hash chain", async () => {
    await appendRegistro({
      partidaId,
      authorId: managerId,
      category: null,
      text: "chain row",
      progressPct: null,
      gpsLat: null,
      gpsLng: null,
      locationId: null,
      attachments: [],
    });

    await renamePartida(fd({ partidaId, name: "Partida renombrada" }));

    await expect(prisma.partida.findUniqueOrThrow({ where: { id: partidaId } })).resolves.toMatchObject({ name: "Partida renombrada" });
    const rows = await prisma.registro.findMany({
      where: { partidaId },
      include: { attachments: true },
      orderBy: [{ serverCreatedAt: "asc" }, { id: "asc" }],
    });
    expect(verifyChain(rows.map(toStored))).toEqual({ ok: true });
    await expect(prisma.auditLog.findFirstOrThrow({ where: { targetType: "Partida", targetId: partidaId, action: "partida.rename" } })).resolves.toBeTruthy();
  });

  it("moves a partida within the same project and audits the move", async () => {
    await movePartida(fd({ partidaId, segmentId: segmentBId }));

    await expect(prisma.partida.findUniqueOrThrow({ where: { id: partidaId } })).resolves.toMatchObject({ segmentId: segmentBId });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { targetType: "Partida", targetId: partidaId, action: "partida.move" } });
    expect(audit.summary).toContain("Partida movida");
  });

  it("rejects moves to another project's bloque", async () => {
    await expect(movePartida(fd({ partidaId, segmentId: otherSegmentId }))).rejects.toThrow(/bloque/i);
  });

  it("rejects edits by non-manager roles", async () => {
    authMock.mockResolvedValue({ user: { id: residentId, companyId, role: "RESIDENT" } });
    await expect(renameProject(fd({ projectId, name: "Nope" }))).rejects.toThrow();
  });

  it("rejects moving a deleted partida", async () => {
    const deleted = await prisma.partida.create({
      data: { projectId, name: "Deleted move target", deletedAt: new Date(), deletedById: managerId },
    });

    await expect(movePartida(fd({ partidaId: deleted.id, segmentId: segmentAId }))).rejects.toThrow();
  });
});
