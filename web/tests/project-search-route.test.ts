import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { generateRegistrationCode } from "@/lib/project/registration-code";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));

import { GET } from "@/app/api/projects/[id]/search/route";

let companyId = "", managerId = "", projectId = "", shortId = "", cappedId = "";
const token = `sr${Date.now().toString(36)}`;
const cappedName = `${token}${"Y".repeat(220)}`;

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `SR Co ${token}` } })).id;
  managerId = (await prisma.user.create({
    data: { email: `sr-${token}@x.do`, name: "SR", role: "MANAGER", companyId, passwordHash: "x" },
  })).id;
  projectId = (await prisma.project.create({
    data: { companyId, name: `SR Obra ${token}`, registrationCode: generateRegistrationCode() },
  })).id;
  shortId = (await prisma.partida.create({ data: { projectId, name: `${token}a` } })).id;
  cappedId = (await prisma.partida.create({ data: { projectId, name: cappedName } })).id;
});

afterAll(async () => {
  await prisma.partida.deleteMany({ where: { id: { in: [shortId, cappedId] } } });
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.user.deleteMany({ where: { id: managerId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.$disconnect();
});

function call(q: string) {
  return GET(
    new Request(`http://test.local/api/projects/${projectId}/search?q=${encodeURIComponent(q)}`),
    { params: Promise.resolve({ id: projectId }) },
  );
}

const empty = { partidas: [], registros: [], documentos: [], cambios: [] };

describe("GET /api/projects/[id]/search", () => {
  it("401 when the session is missing", async () => {
    authMock.mockResolvedValue(null);
    const res = await call(token);
    expect(res.status).toBe(401);
  });

  it("trims q before searching", async () => {
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    const res = await call(`  ${token}a  `);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.partidas.map((p: { id: string }) => p.id)).toContain(shortId);
  });

  it("returns empty groups under 2 characters and does not match a one-character name", async () => {
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    const res = await call(` ${token.slice(0, 1)} `);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(empty);
  });

  it("searches only the first 200 characters", async () => {
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    const res = await call(`${cappedName}TAIL-NOT-IN-NAME`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.partidas.map((p: { id: string }) => p.id)).toContain(cappedId);
  });
});
