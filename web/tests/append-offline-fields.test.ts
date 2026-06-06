import { afterAll, beforeAll, expect, it, describe } from "vitest";
import { prisma } from "@/lib/db";
import { appendRegistro } from "@/lib/registro/append";
import { verifyChain } from "@/lib/registro/hash";
import { toStored } from "@/lib/registro/map";

let companyId = "", authorId = "", projectId = "", partidaId = "";
beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `Off Co ${s}` } })).id;
  authorId = (await prisma.user.create({ data: { email: `o-${s}@x.do`, name: "O", role: "ADMIN", companyId, passwordHash: "x" } })).id;
  projectId = (await prisma.project.create({ data: { companyId, name: `Off P ${s}` } })).id;
  partidaId = (await prisma.partida.create({ data: { projectId, name: "off" } })).id;
});
afterAll(async () => {
  await prisma.registro.deleteMany({ where: { partidaId } });
  await prisma.partida.deleteMany({ where: { id: partidaId } });
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.user.deleteMany({ where: { id: authorId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.$disconnect();
});

describe("appendRegistro offline fields", () => {
  it("stores idempotencyKey + clientCapturedAt but keeps them out of the hash", async () => {
    const captured = new Date("2026-06-01T14:03:00.000Z");
    const rec = await appendRegistro({
      partidaId, authorId, category: null, text: "campo", progressPct: null,
      gpsLat: null, gpsLng: null, locationId: null, attachments: [],
      idempotencyKey: "uuid-123", clientCapturedAt: captured,
    });
    expect(rec.idempotencyKey).toBe("uuid-123");
    expect(rec.clientCapturedAt?.toISOString()).toBe(captured.toISOString());
    const stored = await prisma.registro.findMany({ where: { partidaId }, orderBy: { serverCreatedAt: "asc" }, include: { attachments: true } });
    expect(verifyChain(stored.map(toStored)).ok).toBe(true);
  });
});
