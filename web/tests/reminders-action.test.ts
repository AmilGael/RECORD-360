import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { appendRegistro } from "@/lib/registro/append";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { resolveReminder } from "@/app/actions/reminders";

let companyId = "", otherCompanyId = "", managerId = "", otherManagerId = "", projectId = "", partidaId = "";

beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `Rem Co ${s}` } })).id;
  otherCompanyId = (await prisma.company.create({ data: { name: `Rem Other ${s}` } })).id;
  managerId = (await prisma.user.create({ data: { email: `m-${s}@x.do`, name: "M", role: "MANAGER", companyId, passwordHash: "x" } })).id;
  otherManagerId = (await prisma.user.create({ data: { email: `om-${s}@x.do`, name: "OM", role: "MANAGER", companyId: otherCompanyId, passwordHash: "x" } })).id;
  projectId = (await prisma.project.create({ data: { companyId, name: `Rem Project ${s}` } })).id;
  partidaId = (await prisma.partida.create({ data: { projectId, name: "P" } })).id;
});

afterAll(async () => {
  await prisma.registro.deleteMany({ where: { partidaId } });
  await prisma.partida.deleteMany({ where: { id: partidaId } });
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.user.deleteMany({ where: { id: { in: [managerId, otherManagerId] } } });
  await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } });
  await prisma.$disconnect();
});

beforeEach(() => { authMock.mockReset(); revalidatePathMock.mockReset(); });
function fd(registroId: string) { const f = new FormData(); f.set("registroId", registroId); return f; }
async function makeReminder() {
  const r = await appendRegistro({ partidaId, authorId: managerId, category: null, text: "rem", progressPct: null, gpsLat: null, gpsLng: null, locationId: null, attachments: [], reminderDueAt: new Date(Date.now() + 86_400_000) });
  return r.id;
}

describe("resolveReminder", () => {
  it("sets reminderResolvedAt for a member with project access", async () => {
    const id = await makeReminder();
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    await resolveReminder(fd(id));
    const after = await prisma.registro.findUniqueOrThrow({ where: { id } });
    expect(after.reminderResolvedAt).not.toBeNull();
  });

  it("rejects a user from another company", async () => {
    const id = await makeReminder();
    authMock.mockResolvedValue({ user: { id: otherManagerId, companyId: otherCompanyId, role: "MANAGER" } });
    await expect(resolveReminder(fd(id))).rejects.toThrow();
    const after = await prisma.registro.findUniqueOrThrow({ where: { id } });
    expect(after.reminderResolvedAt).toBeNull();
  });

  it("rejects a registro that has no reminder", async () => {
    const r = await appendRegistro({ partidaId, authorId: managerId, category: null, text: "no rem", progressPct: null, gpsLat: null, gpsLng: null, locationId: null, attachments: [] });
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    await expect(resolveReminder(fd(r.id))).rejects.toThrow();
  });
});
