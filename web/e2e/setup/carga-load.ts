import path from "node:path";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";

loadEnv({ path: path.resolve(__dirname, "../../.env.local"), quiet: true });

const OBRA = "E2E Obra Demo";
const BLOQUE = "Carga";
const PREFIX = "Q4 carga ";
const COUNT = 300;

function hostOf(url: string | undefined, name: string): string {
  if (!url) throw new Error(`${name} is missing`);
  return new URL(url).hostname;
}

export function assertLocalDatabase() {
  const dbHost = hostOf(process.env.DATABASE_URL, "DATABASE_URL");
  const directHost = hostOf(process.env.DIRECT_URL, "DIRECT_URL");
  if (dbHost !== "localhost" && dbHost !== "127.0.0.1") {
    throw new Error(`Refusing to write load data: DATABASE_URL host is ${dbHost}`);
  }
  if (directHost !== "localhost" && directHost !== "127.0.0.1") {
    throw new Error(`Refusing to write load data: DIRECT_URL host is ${directHost}`);
  }
  return dbHost;
}

export async function seedCarga(prisma: PrismaClient): Promise<{ projectId: string; segmentId: string; firstName: string }> {
  const project = await prisma.project.findFirst({ where: { name: OBRA }, select: { id: true } });
  if (!project) throw new Error(`${OBRA} is missing. Run the @setup fixture first.`);
  let segment = await prisma.segment.findFirst({ where: { projectId: project.id, name: BLOQUE }, select: { id: true } });
  if (!segment) {
    segment = await prisma.segment.create({ data: { projectId: project.id, name: BLOQUE }, select: { id: true } });
  }
  const existing = await prisma.partida.count({ where: { segmentId: segment.id, deletedAt: null, name: { startsWith: PREFIX } } });
  const missing = COUNT - existing;
  if (missing > 0) {
    await prisma.partida.createMany({
      data: Array.from({ length: missing }, (_, i) => ({
        projectId: project.id,
        segmentId: segment!.id,
        name: `${PREFIX}${String(existing + i + 1).padStart(3, "0")}`,
      })),
    });
  }
  return { projectId: project.id, segmentId: segment.id, firstName: `${PREFIX}001` };
}

export async function removeCarga(prisma: PrismaClient): Promise<number> {
  const project = await prisma.project.findFirst({ where: { name: OBRA }, select: { id: true } });
  if (!project) return 0;
  const segment = await prisma.segment.findFirst({ where: { projectId: project.id, name: BLOQUE }, select: { id: true } });
  if (!segment) return 0;
  const partidas = await prisma.partida.findMany({ where: { segmentId: segment.id }, select: { id: true } });
  const ids = partidas.map((p) => p.id);
  if (ids.length) {
    await prisma.partidaTagOnPartida.deleteMany({ where: { partidaId: { in: ids } } });
    await prisma.changeRequestPartida.deleteMany({ where: { partidaId: { in: ids } } });
    await prisma.partida.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.changeRequestSegment.deleteMany({ where: { segmentId: segment.id } });
  await prisma.document.deleteMany({ where: { segmentId: segment.id } });
  await prisma.segment.deleteMany({ where: { id: segment.id } });
  return ids.length;
}

export async function cargaRemaining(prisma: PrismaClient): Promise<number> {
  const project = await prisma.project.findFirst({ where: { name: OBRA }, select: { id: true } });
  if (!project) return 0;
  return prisma.partida.count({
    where: { projectId: project.id, deletedAt: null, segment: { name: BLOQUE } },
  });
}
