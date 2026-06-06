import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { appendRegistro } from "@/lib/registro/append";

const authMock = vi.hoisted(() => vi.fn());

vi.mock("@/auth", () => ({
  auth: authMock,
}));

import { GET } from "@/app/api/partidas/[id]/report/route";

let companyAId = "";
let companyBId = "";
let managerAId = "";
let userBId = "";
let projectAId = "";
let partidaAId = "";

beforeAll(async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const companyA = await prisma.company.create({ data: { name: `Report Co A ${suffix}` } });
  const companyB = await prisma.company.create({ data: { name: `Report Co B ${suffix}` } });
  companyAId = companyA.id;
  companyBId = companyB.id;

  const managerA = await prisma.user.create({
    data: { email: `report-mgr-a-${suffix}@x.do`, name: "Manager A", role: "MANAGER", companyId: companyAId, passwordHash: "x" },
  });
  const userB = await prisma.user.create({
    data: { email: `report-usr-b-${suffix}@x.do`, name: "User B", role: "MANAGER", companyId: companyBId, passwordHash: "x" },
  });
  managerAId = managerA.id;
  userBId = userB.id;

  const projectA = await prisma.project.create({ data: { companyId: companyAId, name: `Report Project ${suffix}` } });
  projectAId = projectA.id;
  const partidaA = await prisma.partida.create({ data: { projectId: projectAId, name: "Report Partida" } });
  partidaAId = partidaA.id;

  // Two registros to have a verifiable chain
  await appendRegistro({
    partidaId: partidaAId,
    authorId: managerAId,
    category: "MATERIALES",
    text: "First entry for PDF report",
    progressPct: 30,
    gpsLat: 18.4861,
    gpsLng: -69.9312,
    locationId: null,
    attachments: [],
  });
  await appendRegistro({
    partidaId: partidaAId,
    authorId: managerAId,
    category: "PROCESOS",
    text: "Second entry for PDF report",
    progressPct: 60,
    gpsLat: null,
    gpsLng: null,
    locationId: null,
    attachments: [{ fileType: "IMAGE", url: "/api/media/report-test.png", sha256: "a".repeat(64) }],
  });
});

afterAll(async () => {
  await prisma.attachment.deleteMany({ where: { registro: { partidaId: partidaAId } } });
  await prisma.registro.deleteMany({ where: { partidaId: partidaAId } });
  await prisma.partida.deleteMany({ where: { id: partidaAId } });
  await prisma.project.deleteMany({ where: { id: projectAId } });
  await prisma.user.deleteMany({ where: { id: { in: [managerAId, userBId] } } });
  await prisma.company.deleteMany({ where: { id: { in: [companyAId, companyBId] } } });
  await prisma.$disconnect();
});

describe("GET /api/partidas/[id]/report", () => {
  it("returns 200 with application/pdf for an authorized manager", async () => {
    authMock.mockResolvedValue({ user: { id: managerAId, companyId: companyAId, role: "MANAGER" } });

    const res = await GET(new Request("http://test.local/api/partidas/" + partidaAId + "/report"), {
      params: Promise.resolve({ id: partidaAId }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/pdf");
  });

  it("returns 404 for a user from a different company", async () => {
    authMock.mockResolvedValue({ user: { id: userBId, companyId: companyBId, role: "MANAGER" } });

    const res = await GET(new Request("http://test.local/api/partidas/" + partidaAId + "/report"), {
      params: Promise.resolve({ id: partidaAId }),
    });

    expect(res.status).toBe(404);
  });

  it("returns 401 for an unauthenticated request", async () => {
    authMock.mockResolvedValue(null);

    const res = await GET(new Request("http://test.local/api/partidas/" + partidaAId + "/report"), {
      params: Promise.resolve({ id: partidaAId }),
    });

    expect(res.status).toBe(401);
  });
});
