import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { appendRegistro } from "@/lib/registro/append";
import { generateRegistrationCode } from "@/lib/project/registration-code";

const authMock = vi.hoisted(() => vi.fn());

vi.mock("@/auth", () => ({
  auth: authMock,
}));

import { verifyPartidaChain } from "@/app/actions/verify";

let companyId = "";
let otherCompanyId = "";
let userId = "";
let otherUserId = "";
let projectId = "";
let partidaId = "";

beforeAll(async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const company = await prisma.company.create({ data: { name: `Verify Co ${suffix}` } });
  companyId = company.id;

  const otherCompany = await prisma.company.create({ data: { name: `Other Verify Co ${suffix}` } });
  otherCompanyId = otherCompany.id;

  const user = await prisma.user.create({
    data: { email: `verify-${suffix}@x.do`, name: "Verify User", role: "MANAGER", companyId, passwordHash: "x" },
  });
  userId = user.id;

  const otherUser = await prisma.user.create({
    data: { email: `other-verify-${suffix}@x.do`, name: "Other User", role: "MANAGER", companyId: otherCompanyId, passwordHash: "x" },
  });
  otherUserId = otherUser.id;

  const project = await prisma.project.create({ data: { companyId, name: `Verify Project ${suffix}`, registrationCode: generateRegistrationCode() } });
  projectId = project.id;

  const partida = await prisma.partida.create({ data: { projectId, name: "Verify Partida" } });
  partidaId = partida.id;

  // Append 2 registros to build the chain
  await appendRegistro({
    partidaId, authorId: userId, category: null, text: "entry one",
    progressPct: null, gpsLat: null, gpsLng: null, locationId: null, attachments: [],
  });
  await appendRegistro({
    partidaId, authorId: userId, category: null, text: "entry two",
    progressPct: null, gpsLat: null, gpsLng: null, locationId: null, attachments: [],
  });
});

afterAll(async () => {
  await prisma.registro.deleteMany({ where: { partidaId } });
  await prisma.partida.deleteMany({ where: { id: partidaId } });
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
  await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } });
  await prisma.$disconnect();
});

beforeEach(() => {
  authMock.mockReset();
  authMock.mockResolvedValue({ user: { id: userId, companyId, role: "MANAGER" } });
});

describe("verifyPartidaChain", () => {
  it("returns status ok with count 2 for an intact chain", async () => {
    const fd = new FormData();
    fd.set("partidaId", partidaId);
    const result = await verifyPartidaChain(null, fd);
    expect(result).toEqual({ status: "ok", count: 2 });
  });

  it("returns status error for a cross-company user", async () => {
    authMock.mockResolvedValue({ user: { id: otherUserId, companyId: otherCompanyId, role: "MANAGER" } });
    const fd = new FormData();
    fd.set("partidaId", partidaId);
    const result = await verifyPartidaChain(null, fd);
    expect(result).toEqual({ status: "error", message: "No autorizado." });
  });

  it("returns status error when not authenticated", async () => {
    authMock.mockResolvedValue(null);
    const fd = new FormData();
    fd.set("partidaId", partidaId);
    const result = await verifyPartidaChain(null, fd);
    expect(result).toEqual({ status: "error", message: "No autorizado." });
  });
});
