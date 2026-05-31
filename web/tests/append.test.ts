import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { appendRegistro } from "@/lib/registro/append";
import { toStored } from "@/lib/registro/map";
import { verifyChain, GENESIS_PREV_HASH } from "@/lib/registro/hash";

let companyId = "", projectId = "", partidaId = "", userId = "";

beforeAll(async () => {
  const c = await prisma.company.create({ data: { name: "T Co" } });
  companyId = c.id;
  const u = await prisma.user.create({ data: { email: `t${Date.now()}@x.do`, name: "T", role: "RESIDENT", companyId, passwordHash: "x" } });
  userId = u.id;
  const p = await prisma.project.create({ data: { companyId, name: "T Proj" } });
  projectId = p.id;
  const pa = await prisma.partida.create({ data: { projectId, name: "T Partida" } });
  partidaId = pa.id;
});

afterAll(async () => {
  await prisma.registro.deleteMany({ where: { partidaId } });
  await prisma.partida.deleteMany({ where: { projectId } });
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.$disconnect();
});

describe("appendRegistro", () => {
  it("first entry uses genesis prevHash; second links to first; chain verifies; progress updates partida", async () => {
    const r1 = await appendRegistro({ partidaId, authorId: userId, type: "NOTE", text: "uno", mediaUrl: null, progressPct: 40, gpsLat: 18.4861, gpsLng: -69.9312 });
    expect(r1.prevHash).toBe(GENESIS_PREV_HASH);

    const r2 = await appendRegistro({ partidaId, authorId: userId, type: "NOTE", text: "dos", mediaUrl: null, progressPct: 72, gpsLat: null, gpsLng: null });
    expect(r2.prevHash).toBe(r1.hash);

    const rows = await prisma.registro.findMany({ where: { partidaId }, orderBy: [{ serverCreatedAt: "asc" }, { id: "asc" }] });
    expect(verifyChain(rows.map(toStored))).toEqual({ ok: true });

    const partida = await prisma.partida.findUniqueOrThrow({ where: { id: partidaId } });
    expect(partida.progressPct).toBe(72);
  });
});
