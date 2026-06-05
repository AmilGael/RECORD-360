import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { appendRegistro } from "@/lib/registro/append";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { deletePartida, restorePartida, purgePartida } from "@/app/actions/partida-crud";

let companyId = "", adminId = "", managerId = "", projectId = "";

beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `Del Co ${s}` } })).id;
  adminId = (await prisma.user.create({ data: { email: `a-${s}@x.do`, name: "A", role: "ADMIN", companyId, passwordHash: "x" } })).id;
  managerId = (await prisma.user.create({ data: { email: `m-${s}@x.do`, name: "M", role: "MANAGER", companyId, passwordHash: "x" } })).id;
  projectId = (await prisma.project.create({ data: { companyId, name: `Del Project ${s}` } })).id;
});

afterAll(async () => {
  await prisma.registro.deleteMany({ where: { partida: { projectId } } });
  await prisma.partida.deleteMany({ where: { projectId } });
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, managerId] } } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.$disconnect();
});

beforeEach(() => { authMock.mockReset(); revalidatePathMock.mockReset(); });
function fd(partidaId: string) { const f = new FormData(); f.set("partidaId", partidaId); return f; }
const asAdmin = () => authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
const asManager = () => authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });

describe("partida soft delete (ADMIN only)", () => {
  it("admin deletePartida sets deletedAt + deletedById; restore clears them", async () => {
    asAdmin();
    const p = await prisma.partida.create({ data: { projectId, name: "to delete" } });
    await deletePartida(fd(p.id));
    let after = await prisma.partida.findUniqueOrThrow({ where: { id: p.id } });
    expect(after.deletedAt).not.toBeNull();
    expect(after.deletedById).toBe(adminId);
    await restorePartida(fd(p.id));
    after = await prisma.partida.findUniqueOrThrow({ where: { id: p.id } });
    expect(after.deletedAt).toBeNull();
    expect(after.deletedById).toBeNull();
  });

  it("manager cannot delete or restore (admin-only)", async () => {
    asManager();
    const p = await prisma.partida.create({ data: { projectId, name: "mgr cannot delete" } });
    await expect(deletePartida(fd(p.id))).rejects.toThrow();
    expect((await prisma.partida.findUniqueOrThrow({ where: { id: p.id } })).deletedAt).toBeNull();
    await expect(restorePartida(fd(p.id))).rejects.toThrow();
    await prisma.partida.delete({ where: { id: p.id } });
  });

  it("purge refuses when the partida has registros", async () => {
    asAdmin();
    const p = await prisma.partida.create({ data: { projectId, name: "with records" } });
    await appendRegistro({ partidaId: p.id, authorId: adminId, category: null, text: "x", progressPct: null, gpsLat: null, gpsLng: null, locationId: null, attachments: [] });
    await expect(purgePartida(fd(p.id))).rejects.toThrow(/inalterable|registros/i);
    expect(await prisma.partida.count({ where: { id: p.id } })).toBe(1);
  });

  it("purge hard-deletes an empty partida (admin)", async () => {
    asAdmin();
    const p = await prisma.partida.create({ data: { projectId, name: "empty" } });
    await purgePartida(fd(p.id));
    expect(await prisma.partida.count({ where: { id: p.id } })).toBe(0);
  });

  it("manager cannot purge (admin-only)", async () => {
    asManager();
    const p = await prisma.partida.create({ data: { projectId, name: "empty2" } });
    await expect(purgePartida(fd(p.id))).rejects.toThrow();
    await prisma.partida.delete({ where: { id: p.id } });
  });
});
