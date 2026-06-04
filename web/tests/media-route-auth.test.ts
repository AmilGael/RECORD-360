import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import { prisma } from "@/lib/db";
import { appendRegistro } from "@/lib/registro/append";

const storageGet = vi.hoisted(() => vi.fn());
const authMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/storage", () => ({
  storage: { get: storageGet },
}));

vi.mock("@/auth", () => ({
  auth: authMock,
}));

import { GET } from "@/app/api/media/[key]/route";

let companyAId = "";
let companyBId = "";
let userAId = "";
let userBId = "";
let projectAId = "";
let partidaAId = "";
let registroAId = "";

beforeAll(async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const companyA = await prisma.company.create({ data: { name: `Media A ${suffix}` } });
  const companyB = await prisma.company.create({ data: { name: `Media B ${suffix}` } });
  companyAId = companyA.id;
  companyBId = companyB.id;

  const userA = await prisma.user.create({
    data: { email: `media-a-${suffix}@x.do`, name: "Media A", role: "RESIDENT", companyId: companyAId, passwordHash: "x" },
  });
  const userB = await prisma.user.create({
    data: { email: `media-b-${suffix}@x.do`, name: "Media B", role: "RESIDENT", companyId: companyBId, passwordHash: "x" },
  });
  userAId = userA.id;
  userBId = userB.id;

  const projectA = await prisma.project.create({ data: { companyId: companyAId, name: `Media Project ${suffix}` } });
  projectAId = projectA.id;
  const partidaA = await prisma.partida.create({ data: { projectId: projectAId, name: "Media Partida" } });
  partidaAId = partidaA.id;

  const registroA = await appendRegistro({
    partidaId: partidaAId,
    authorId: userAId,
    category: null,
    text: "with media",
    progressPct: null,
    gpsLat: null,
    gpsLng: null,
    locationId: null,
    attachments: [{ fileType: "IMAGE", url: "/api/media/owned.png", sha256: "a".repeat(64) }],
  });
  registroAId = registroA.id;
});

afterAll(async () => {
  await prisma.attachment.deleteMany({ where: { registroId: registroAId } });
  await prisma.registro.deleteMany({ where: { id: registroAId } });
  await prisma.partida.deleteMany({ where: { id: partidaAId } });
  await prisma.project.deleteMany({ where: { id: projectAId } });
  await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
  await prisma.company.deleteMany({ where: { id: { in: [companyAId, companyBId] } } });
  await prisma.$disconnect();
});

beforeEach(() => {
  storageGet.mockReset();
  authMock.mockReset();
  storageGet.mockResolvedValue(Readable.from(["ok"]));
});

describe("GET /api/media/[key]", () => {
  it("serves an attachment for a user in the owning company", async () => {
    authMock.mockResolvedValue({ user: { id: userAId, companyId: companyAId } });

    const response = await GET(new Request("http://test.local/api/media/owned.png"), {
      params: Promise.resolve({ key: "owned.png" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(storageGet).toHaveBeenCalledWith("owned.png");
  });

  it("does not serve another company's attachment", async () => {
    authMock.mockResolvedValue({ user: { id: userBId, companyId: companyBId } });

    const response = await GET(new Request("http://test.local/api/media/owned.png"), {
      params: Promise.resolve({ key: "owned.png" }),
    });

    expect(response.status).toBe(404);
    expect(storageGet).not.toHaveBeenCalled();
  });
});
