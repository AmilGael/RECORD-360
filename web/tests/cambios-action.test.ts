import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { verifyChain } from "@/lib/registro/hash";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { createChangeRequest, resolveChangeRequest } from "@/app/actions/cambios";

let companyId = "", managerId = "", residentId = "", projectId = "", segmentA = "", segmentB = "", pA = "", pB = "";

beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const company = await prisma.company.create({ data: { name: `CR Co ${s}` } });
  companyId = company.id;
  managerId = (await prisma.user.create({ data: { email: `mgr-${s}@x.do`, name: "Mgr", role: "MANAGER", companyId, passwordHash: "x" } })).id;
  residentId = (await prisma.user.create({ data: { email: `res-${s}@x.do`, name: "Res", role: "RESIDENT", companyId, passwordHash: "x" } })).id;
  projectId = (await prisma.project.create({ data: { companyId, name: `CR Project ${s}` } })).id;
  await prisma.projectAssignment.create({ data: { projectId, userId: residentId, role: "RESIDENT" } });
  segmentA = (await prisma.segment.create({ data: { projectId, name: "Bloque A" } })).id;
  segmentB = (await prisma.segment.create({ data: { projectId, name: "Bloque B" } })).id;
  pA = (await prisma.partida.create({ data: { projectId, segmentId: segmentA, name: "Cimentación N1" } })).id;
  pB = (await prisma.partida.create({ data: { projectId, segmentId: segmentA, name: "Instalaciones N2" } })).id;
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { companyId } });
  await prisma.registro.deleteMany({ where: { partidaId: { in: [pA, pB] } } });
  await prisma.changeRequestPartida.deleteMany({ where: { partidaId: { in: [pA, pB] } } });
  await prisma.changeRequestSegment.deleteMany({ where: { segmentId: { in: [segmentA, segmentB] } } });
  await prisma.changeAttachment.deleteMany({ where: { changeRequest: { projectId } } });
  await prisma.changeRequest.deleteMany({ where: { projectId } });
  await prisma.projectAssignment.deleteMany({ where: { projectId } });
  await prisma.partida.deleteMany({ where: { id: { in: [pA, pB] } } });
  await prisma.segment.deleteMany({ where: { id: { in: [segmentA, segmentB] } } });
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.user.deleteMany({ where: { id: { in: [managerId, residentId] } } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.$disconnect();
});

beforeEach(() => { authMock.mockReset(); revalidatePathMock.mockReset(); });

function fd(entries: Record<string, string | string[]>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) {
    if (Array.isArray(v)) v.forEach((x) => f.append(k, x));
    else f.set(k, v);
  }
  return f;
}

describe("createChangeRequest", () => {
  it("creates an OPEN request linked to the affected bloques", async () => {
    authMock.mockResolvedValue({ user: { id: residentId, companyId, role: "RESIDENT" } });
    await createChangeRequest(fd({ projectId, title: "Refuerzo de zapata", description: "extra acero", segmentIds: [segmentA, segmentB] }));
    const cr = await prisma.changeRequest.findFirstOrThrow({ where: { projectId, title: "Refuerzo de zapata" }, include: { segments: true } });
    expect(cr.status).toBe("OPEN");
    expect(cr.code).toMatch(/^SC-\d+$/);
    expect(cr.costImpact).toBeNull();
    expect(cr.daysImpact).toBeNull();
    expect(cr.segments.map((s) => s.segmentId).sort()).toEqual([segmentA, segmentB].sort());
  });

  it("rejects when no bloque is selected", async () => {
    authMock.mockResolvedValue({ user: { id: residentId, companyId, role: "RESIDENT" } });
    await expect(createChangeRequest(fd({ projectId, title: "x", segmentIds: [] }))).rejects.toThrow();
  });
});

async function openCR(authorId: string, segmentIds: string[]) {
  authMock.mockResolvedValue({ user: { id: authorId, companyId, role: authorId === managerId ? "MANAGER" : "RESIDENT" } });
  await createChangeRequest(fd({ projectId, title: `T-${Math.random()}`, segmentIds }));
  return prisma.changeRequest.findFirstOrThrow({ orderBy: { createdAt: "desc" }, where: { projectId } });
}

describe("resolveChangeRequest", () => {
  it("INTEGRATE seals the request and appends a linked marker per active partida in selected bloques", async () => {
    const cr = await openCR(residentId, [segmentA]);
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    await resolveChangeRequest(fd({ changeRequestId: cr.id, action: "INTEGRATE" }));

    const after = await prisma.changeRequest.findUniqueOrThrow({ where: { id: cr.id } });
    expect(after.status).toBe("INTEGRATED");
    expect(after.seal).toMatch(/^[0-9a-f]{64}$/);

    for (const partidaId of [pA, pB]) {
      const marker = await prisma.registro.findFirst({ where: { partidaId, changeRequestId: cr.id } });
      expect(marker).not.toBeNull();
      expect(marker?.text).toMatch(/Solicitud de cambio/);
      const chain = await prisma.registro.findMany({ where: { partidaId }, orderBy: [{ serverCreatedAt: "asc" }, { id: "asc" }] });
      expect(verifyChain(chain.map((r) => ({ ...r, gpsLat: r.gpsLat ? Number(r.gpsLat) : null, gpsLng: r.gpsLng ? Number(r.gpsLng) : null, attachments: [] }))).ok).toBe(true);
    }
  });

  it("INTEGRATE excludes deleted partidas inside selected bloques", async () => {
    const deleted = await prisma.partida.create({ data: { projectId, segmentId: segmentA, name: "Borrada", deletedAt: new Date(), deletedById: managerId } });
    const cr = await openCR(residentId, [segmentA]);
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    await resolveChangeRequest(fd({ changeRequestId: cr.id, action: "INTEGRATE" }));
    expect(await prisma.registro.count({ where: { partidaId: deleted.id, changeRequestId: cr.id } })).toBe(0);
    await prisma.partida.delete({ where: { id: deleted.id } });
  });

  it("REJECT marks rejected with reason, no seal, and no markers", async () => {
    const cr = await openCR(residentId, [segmentA]);
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    await resolveChangeRequest(fd({ changeRequestId: cr.id, action: "REJECT", rejectionReason: "No corresponde al alcance." }));
    const after = await prisma.changeRequest.findUniqueOrThrow({ where: { id: cr.id } });
    expect(after.status).toBe("REJECTED");
    expect(after.rejectionReason).toBe("No corresponde al alcance.");
    expect(after.seal).toBeNull();
    expect(await prisma.registro.count({ where: { changeRequestId: cr.id } })).toBe(0);
  });

  it("REJECT requires a reason", async () => {
    const cr = await openCR(residentId, [segmentA]);
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    await expect(resolveChangeRequest(fd({ changeRequestId: cr.id, action: "REJECT" }))).rejects.toThrow(/motivo/i);
  });

  it("rejects a non-manager", async () => {
    const cr = await openCR(residentId, [segmentA]);
    authMock.mockResolvedValue({ user: { id: residentId, companyId, role: "RESIDENT" } });
    await expect(resolveChangeRequest(fd({ changeRequestId: cr.id, action: "INTEGRATE" }))).rejects.toThrow();
  });

  it("forbids resolving your own request", async () => {
    const cr = await openCR(managerId, [segmentA]); // opened by the manager
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    await expect(resolveChangeRequest(fd({ changeRequestId: cr.id, action: "INTEGRATE" }))).rejects.toThrow(/propia/i);
  });
});
