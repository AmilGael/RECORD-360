import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { appendRegistro } from "@/lib/registro/append";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("@/auth", () => ({
  auth: authMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

import { logRegistro } from "@/app/actions/registro";

let companyId = "";
let userId = "";
let projectId = "";
let partidaId = "";
let otherPartidaId = "";
let baseRegistroId = "";
let otherRegistroId = "";

beforeAll(async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const company = await prisma.company.create({ data: { name: `Correction Co ${suffix}` } });
  companyId = company.id;
  const user = await prisma.user.create({
    data: { email: `correction-${suffix}@x.do`, name: "Correction User", role: "RESIDENT", companyId, passwordHash: "x" },
  });
  userId = user.id;
  const project = await prisma.project.create({ data: { companyId, name: `Correction Project ${suffix}` } });
  projectId = project.id;
  const partida = await prisma.partida.create({ data: { projectId, name: "Correction Partida" } });
  partidaId = partida.id;
  const otherPartida = await prisma.partida.create({ data: { projectId, name: "Other Partida" } });
  otherPartidaId = otherPartida.id;

  const base = await appendRegistro({
    partidaId,
    authorId: userId,
    category: null,
    text: "base",
    progressPct: null,
    gpsLat: null,
    gpsLng: null,
    locationId: null,
    attachments: [],
  });
  baseRegistroId = base.id;

  const other = await appendRegistro({
    partidaId: otherPartidaId,
    authorId: userId,
    category: null,
    text: "other",
    progressPct: null,
    gpsLat: null,
    gpsLng: null,
    locationId: null,
    attachments: [],
  });
  otherRegistroId = other.id;
});

afterAll(async () => {
  await prisma.registro.deleteMany({ where: { partidaId: { in: [partidaId, otherPartidaId] } } });
  await prisma.partida.deleteMany({ where: { id: { in: [partidaId, otherPartidaId] } } });
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.$disconnect();
});

beforeEach(() => {
  authMock.mockReset();
  revalidatePathMock.mockReset();
  authMock.mockResolvedValue({ user: { id: userId, companyId } });
});

describe("logRegistro corrections", () => {
  it("stores correctionOfId when the target registro belongs to the same partida", async () => {
    const fd = new FormData();
    fd.set("partidaId", partidaId);
    fd.set("text", "corrected note");
    fd.set("correctionOfId", baseRegistroId);

    const res = await logRegistro(null, fd);
    expect(res.ok).toBe(true);
    const correction = await prisma.registro.findFirstOrThrow({
      where: { partidaId, text: "corrected note" },
      orderBy: [{ serverCreatedAt: "desc" }, { id: "desc" }],
    });
    expect(correction.correctionOfId).toBe(baseRegistroId);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/app/partidas/${partidaId}`);
  });

  it("rejects correction targets from another partida", async () => {
    const before = await prisma.registro.count({ where: { partidaId } });
    const fd = new FormData();
    fd.set("partidaId", partidaId);
    fd.set("text", "bad correction");
    fd.set("correctionOfId", otherRegistroId);
    const res = await logRegistro(null, fd);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/correction/i);
    await expect(prisma.registro.count({ where: { partidaId } })).resolves.toBe(before);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
