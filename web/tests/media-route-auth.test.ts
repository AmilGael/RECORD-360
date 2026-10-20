import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import { prisma } from "@/lib/db";
import { appendRegistro } from "@/lib/registro/append";
import { generateRegistrationCode } from "@/lib/project/registration-code";

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
    data: { email: `media-a-${suffix}@x.do`, name: "Media A", role: "ADMIN", companyId: companyAId, passwordHash: "x" },
  });
  const userB = await prisma.user.create({
    data: { email: `media-b-${suffix}@x.do`, name: "Media B", role: "ADMIN", companyId: companyBId, passwordHash: "x" },
  });
  userAId = userA.id;
  userBId = userB.id;

  const projectA = await prisma.project.create({ data: { companyId: companyAId, name: `Media Project ${suffix}`, registrationCode: generateRegistrationCode() } });
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
  await prisma.changeAttachment.deleteMany({ where: { changeRequest: { projectId: projectAId } } });
  await prisma.changeRequest.deleteMany({ where: { projectId: projectAId } });
  await prisma.document.deleteMany({ where: { projectId: projectAId } });
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
    authMock.mockResolvedValue({ user: { id: userAId, companyId: companyAId, role: "ADMIN" } });

    const response = await GET(new Request("http://test.local/api/media/owned.png"), {
      params: Promise.resolve({ key: "owned.png" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(storageGet).toHaveBeenCalledWith("owned.png");
  });

  it("does not serve another company's attachment", async () => {
    authMock.mockResolvedValue({ user: { id: userBId, companyId: companyBId, role: "ADMIN" } });

    const response = await GET(new Request("http://test.local/api/media/owned.png"), {
      params: Promise.resolve({ key: "owned.png" }),
    });

    expect(response.status).toBe(404);
    expect(storageGet).not.toHaveBeenCalled();
  });

  it("serves change-request evidence for a user in the owning company", async () => {
    const cr = await prisma.changeRequest.create({
      data: { projectId: projectAId, code: "SC-EV", title: "ev", authorId: userAId,
        attachments: { create: [{ url: "/api/media/cr-evid.png", sha256: "b".repeat(64), fileType: "IMAGE" }] } },
    });
    authMock.mockResolvedValue({ user: { id: userAId, companyId: companyAId, role: "ADMIN" } });
    const res = await GET(new Request("http://test.local/api/media/cr-evid.png"), { params: Promise.resolve({ key: "cr-evid.png" }) });
    expect(storageGet).toHaveBeenCalledWith("cr-evid.png");
    expect(res.status).toBe(200);
    await prisma.changeAttachment.deleteMany({ where: { changeRequestId: cr.id } });
    await prisma.changeRequest.deleteMany({ where: { id: cr.id } });
  });

  it("does not serve another company's change-request evidence", async () => {
    const cr = await prisma.changeRequest.create({
      data: { projectId: projectAId, code: "SC-EVX", title: "evx", authorId: userAId,
        attachments: { create: [{ url: "/api/media/cr-evid-x.png", sha256: "c".repeat(64), fileType: "IMAGE" }] } },
    });
    authMock.mockResolvedValue({ user: { id: userBId, companyId: companyBId, role: "ADMIN" } });
    const res = await GET(new Request("http://test.local/api/media/cr-evid-x.png"), { params: Promise.resolve({ key: "cr-evid-x.png" }) });
    expect(res.status).toBe(404);
    expect(storageGet).not.toHaveBeenCalled();
    await prisma.changeAttachment.deleteMany({ where: { changeRequestId: cr.id } });
    await prisma.changeRequest.deleteMany({ where: { id: cr.id } });
  });

  it("serves a project's plan document to a same-company user", async () => {
    const doc = await prisma.document.create({
      data: { projectId: projectAId, kind: "PLANO", url: "/api/media/plano-x.pdf", sha256: "d".repeat(64), fileType: "PDF", uploadedById: userAId },
    });
    authMock.mockResolvedValue({ user: { id: userAId, companyId: companyAId, role: "ADMIN" } });
    const res = await GET(new Request("http://test.local/api/media/plano-x.pdf"), { params: Promise.resolve({ key: "plano-x.pdf" }) });
    expect(storageGet).toHaveBeenCalledWith("plano-x.pdf");
    expect(res.status).toBe(200);
    await prisma.document.deleteMany({ where: { id: doc.id } });
  });
  it("does not serve another company's plan document", async () => {
    const doc = await prisma.document.create({
      data: { projectId: projectAId, kind: "PLANO", url: "/api/media/plano-y.pdf", sha256: "e".repeat(64), fileType: "PDF", uploadedById: userAId },
    });
    authMock.mockResolvedValue({ user: { id: userBId, companyId: companyBId, role: "ADMIN" } });
    const res = await GET(new Request("http://test.local/api/media/plano-y.pdf"), { params: Promise.resolve({ key: "plano-y.pdf" }) });
    expect(res.status).toBe(404);
    expect(storageGet).not.toHaveBeenCalled();
    await prisma.document.deleteMany({ where: { id: doc.id } });
  });

  it("serves a document thumbnail to a member", async () => {
    const doc = await prisma.document.create({
      data: {
        projectId: projectAId, kind: "PLANO", url: "/api/media/plano-thumb.pdf",
        sha256: "f".repeat(64), fileType: "PDF", uploadedById: userAId, thumbKey: "thumb-a.webp",
      },
    });
    authMock.mockResolvedValue({ user: { id: userAId, companyId: companyAId, role: "ADMIN" } });
    const res = await GET(new Request("http://test.local/api/media/thumb-a.webp"), { params: Promise.resolve({ key: "thumb-a.webp" }) });
    expect(res.status).toBe(200);
    expect(storageGet).toHaveBeenCalledWith("thumb-a.webp");
    await prisma.document.deleteMany({ where: { id: doc.id } });
  });
  it("does not serve another tenant's document thumbnail", async () => {
    const doc = await prisma.document.create({
      data: {
        projectId: projectAId, kind: "PLANO", url: "/api/media/plano-thumb-x.pdf",
        sha256: "f".repeat(64), fileType: "PDF", uploadedById: userAId, thumbKey: "thumb-x.webp",
      },
    });
    authMock.mockResolvedValue({ user: { id: userBId, companyId: companyBId, role: "ADMIN" } });
    const res = await GET(new Request("http://test.local/api/media/thumb-x.webp"), { params: Promise.resolve({ key: "thumb-x.webp" }) });
    expect(res.status).toBe(404);
    expect(storageGet).not.toHaveBeenCalled();
    await prisma.document.deleteMany({ where: { id: doc.id } });
  });
});
