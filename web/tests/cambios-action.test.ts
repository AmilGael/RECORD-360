import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { createChangeRequest, resolveChangeRequest } from "@/app/actions/cambios";

let companyId = "", managerId = "", residentId = "", projectId = "", pA = "", pB = "";

beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const company = await prisma.company.create({ data: { name: `CR Co ${s}` } });
  companyId = company.id;
  managerId = (await prisma.user.create({ data: { email: `mgr-${s}@x.do`, name: "Mgr", role: "MANAGER", companyId, passwordHash: "x" } })).id;
  residentId = (await prisma.user.create({ data: { email: `res-${s}@x.do`, name: "Res", role: "RESIDENT", companyId, passwordHash: "x" } })).id;
  projectId = (await prisma.project.create({ data: { companyId, name: `CR Project ${s}` } })).id;
  pA = (await prisma.partida.create({ data: { projectId, name: "Cimentación N1" } })).id;
  pB = (await prisma.partida.create({ data: { projectId, name: "Instalaciones N2" } })).id;
});

afterAll(async () => {
  await prisma.registro.deleteMany({ where: { partidaId: { in: [pA, pB] } } });
  await prisma.changeRequestPartida.deleteMany({ where: { partidaId: { in: [pA, pB] } } });
  await prisma.changeAttachment.deleteMany({ where: { changeRequest: { projectId } } });
  await prisma.changeRequest.deleteMany({ where: { projectId } });
  await prisma.partida.deleteMany({ where: { id: { in: [pA, pB] } } });
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
  it("creates an OPEN request linked to the affected partidas", async () => {
    authMock.mockResolvedValue({ user: { id: residentId, companyId, role: "RESIDENT" } });
    await createChangeRequest(fd({ projectId, title: "Refuerzo de zapata", description: "extra acero", costImpact: "48000", daysImpact: "3", partidaIds: [pA, pB] }));
    const cr = await prisma.changeRequest.findFirstOrThrow({ where: { projectId, title: "Refuerzo de zapata" }, include: { partidas: true } });
    expect(cr.status).toBe("OPEN");
    expect(cr.code).toMatch(/^SC-\d+$/);
    expect(cr.partidas.map((p) => p.partidaId).sort()).toEqual([pA, pB].sort());
  });

  it("rejects when no partida is selected", async () => {
    authMock.mockResolvedValue({ user: { id: residentId, companyId, role: "RESIDENT" } });
    await expect(createChangeRequest(fd({ projectId, title: "x", partidaIds: [] }))).rejects.toThrow();
  });
});
