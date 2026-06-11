import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { generateRegistrationCode } from "@/lib/project/registration-code";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { createPartida } from "@/app/actions/admin";
import { assignProjectUser } from "@/app/actions/project-assignments";
import { updatePartidaProgress } from "@/app/actions/partida-progress";
import { logRegistro } from "@/app/actions/registro";

let companyId = "";
let managerId = "";
let residentId = "";
let otherResidentId = "";
let projectId = "";
let partidaId = "";

function fd(entries: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(entries)) form.set(key, value);
  return form;
}

beforeAll(async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `Assign Co ${suffix}` } })).id;
  managerId = (await prisma.user.create({ data: { email: `assign-m-${suffix}@x.do`, name: "Manager", role: "MANAGER", companyId, passwordHash: "x" } })).id;
  residentId = (await prisma.user.create({ data: { email: `assign-r-${suffix}@x.do`, name: "Resident", role: "RESIDENT", companyId, passwordHash: "x" } })).id;
  otherResidentId = (await prisma.user.create({ data: { email: `assign-o-${suffix}@x.do`, name: "Other", role: "RESIDENT", companyId, passwordHash: "x" } })).id;
  projectId = (await prisma.project.create({ data: { companyId, name: `Assigned Project ${suffix}`, registrationCode: generateRegistrationCode() } })).id;
  partidaId = (await prisma.partida.create({ data: { projectId, name: "Progress Partida", progressPct: 42 } })).id;
});

afterAll(async () => {
  await prisma.registro.deleteMany({ where: { partida: { projectId } } });
  await prisma.projectAssignment.deleteMany({ where: { projectId } });
  await prisma.partida.deleteMany({ where: { projectId } });
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.user.deleteMany({ where: { id: { in: [managerId, residentId, otherResidentId] } } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.$disconnect();
});

beforeEach(() => {
  authMock.mockReset();
  revalidatePathMock.mockReset();
});

describe("project assignments and Partida progress", () => {
  it("assigns a resident to a project", async () => {
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    await assignProjectUser(fd({ projectId, userId: residentId, role: "RESIDENT" }));

    const assignment = await prisma.projectAssignment.findUniqueOrThrow({ where: { projectId_userId: { projectId, userId: residentId } } });
    expect(assignment.role).toBe("RESIDENT");
  });

  it("allows an assigned resident to create a partida, but blocks an unassigned resident", async () => {
    authMock.mockResolvedValue({ user: { id: residentId, companyId, role: "RESIDENT" } });
    await createPartida(fd({ projectId, name: "Resident-created partida" }));
    await expect(prisma.partida.findFirstOrThrow({ where: { projectId, name: "Resident-created partida" } })).resolves.toBeTruthy();

    authMock.mockResolvedValue({ user: { id: otherResidentId, companyId, role: "RESIDENT" } });
    await expect(createPartida(fd({ projectId, name: "Should fail" }))).rejects.toThrow();
  });

  it("updates progress only through the partida progress action", async () => {
    authMock.mockResolvedValue({ user: { id: residentId, companyId, role: "RESIDENT" } });
    await updatePartidaProgress(fd({ partidaId, progressPct: "55" }));
    await expect(prisma.partida.findUniqueOrThrow({ where: { id: partidaId } })).resolves.toMatchObject({ progressPct: 55 });

    const logForm = fd({ partidaId, text: "note with stale progress field", progressPct: "99" });
    await expect(logRegistro(null, logForm)).resolves.toEqual({ ok: true });
    await expect(prisma.partida.findUniqueOrThrow({ where: { id: partidaId } })).resolves.toMatchObject({ progressPct: 55 });
  });
});
