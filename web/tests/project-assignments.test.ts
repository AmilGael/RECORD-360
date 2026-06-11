import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { generateRegistrationCode } from "@/lib/project/registration-code";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { assignProjectUser } from "@/app/actions/project-assignments";

let companyId = "";
let adminId = "";
let projectId = "";
let residentId = "";
let supervisorId = "";

beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `Assign Co ${s}` } })).id;
  adminId = (await prisma.user.create({
    data: { email: `assign-admin-${s}@x.do`, name: "Admin", role: "ADMIN", companyId, passwordHash: "x" },
  })).id;
  residentId = (await prisma.user.create({
    data: { email: `assign-res-${s}@x.do`, name: "Resident", role: "RESIDENT", companyId, passwordHash: "x" },
  })).id;
  supervisorId = (await prisma.user.create({
    data: { email: `assign-sup-${s}@x.do`, name: "Supervisor", role: "SUPERVISOR", companyId, passwordHash: "x" },
  })).id;
  projectId = (await prisma.project.create({ data: { companyId, name: `Assign Project ${s}`, registrationCode: generateRegistrationCode() } })).id;
});

afterAll(async () => {
  await prisma.projectAssignment.deleteMany({ where: { projectId } });
  await prisma.partida.deleteMany({ where: { projectId } });
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, residentId, supervisorId] } } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.$disconnect();
});

beforeEach(() => authMock.mockReset());

function fd(userId: string, role: string) {
  const f = new FormData();
  f.set("projectId", projectId);
  f.set("userId", userId);
  f.set("role", role);
  return f;
}

describe("assignProjectUser", () => {
  it("assigns a matching role", async () => {
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
    await assignProjectUser(fd(residentId, "RESIDENT"));
    const assignment = await prisma.projectAssignment.findFirst({ where: { projectId, userId: residentId } });
    expect(assignment?.role).toBe("RESIDENT");
  });

  it("explains a mismatched role instead of generic Forbidden", async () => {
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
    await expect(assignProjectUser(fd(residentId, "SUPERVISOR"))).rejects.toThrow(/rol global/i);
  });
});
