import type { SessionUser } from "@/lib/authz/projects";
import { hasCompanyWideAccess, projectAccessWhere } from "@/lib/authz/projects";
import { prisma } from "@/lib/db";

const TEXT_LIMIT = 280;
const HASH_PREFIX_LEN = 8;
const RECENT_LIMIT = 5;

export type PartidaPreviewRegistro = {
  id: string;
  text: string | null;
  category: string | null;
  locationLabel: string | null;
  serverCreatedAt: string;
  authorName: string | null;
  attachmentCount: number;
  firstImageUrl: string | null;
  hashPrefix: string;
};

export type PartidaPreview = {
  id: string;
  name: string;
  projectId: string;
  segment: { id: string; name: string; closedAt: string | null } | null;
  progressPct: number;
  completedAt: string | null;
  registroCount: number;
  openRequestCount: number;
  canEdit: boolean;
  tags: string[];
  registros: PartidaPreviewRegistro[];
};

/** Latest registro time per partida, one groupBy. Missing ids are absent from the map. */
export async function lastActivityByPartidaIds(partidaIds: string[]): Promise<Map<string, string>> {
  if (partidaIds.length === 0) return new Map();
  const rows = await prisma.registro.groupBy({
    by: ["partidaId"],
    where: { partidaId: { in: partidaIds } },
    _max: { serverCreatedAt: true },
  });
  const out = new Map<string, string>();
  for (const row of rows) {
    if (row._max.serverCreatedAt) out.set(row.partidaId, row._max.serverCreatedAt.toISOString());
  }
  return out;
}

export async function getPartidaPreview(user: SessionUser, partidaId: string): Promise<PartidaPreview | null> {
  const partida = await prisma.partida.findFirst({
    where: { id: partidaId, deletedAt: null, project: projectAccessWhere(user) },
    select: {
      id: true,
      name: true,
      projectId: true,
      segmentId: true,
      progressPct: true,
      completedAt: true,
      segment: { select: { id: true, name: true, closedAt: true } },
      tags: { select: { tag: { select: { name: true } } } },
      _count: { select: { registros: true } },
    },
  });
  if (!partida) return null;

  const canEdit = hasCompanyWideAccess(user.role)
    || Boolean(await prisma.projectAssignment.findFirst({
      where: { projectId: partida.projectId, userId: user.id },
      select: { id: true },
    }));

  const openWhere = {
    projectId: partida.projectId,
    status: "OPEN" as const,
    OR: [
      { partidas: { some: { partidaId: partida.id } } },
      ...(partida.segmentId ? [{ segments: { some: { segmentId: partida.segmentId } } }] : []),
    ],
  };

  const [registros, openRequestCount] = await Promise.all([
    prisma.registro.findMany({
      where: { partidaId: partida.id },
      orderBy: [{ serverCreatedAt: "desc" }, { id: "desc" }],
      take: RECENT_LIMIT,
      select: {
        id: true,
        text: true,
        category: true,
        serverCreatedAt: true,
        authorId: true,
        hash: true,
        location: { select: { label: true } },
        attachments: { select: { fileType: true, url: true } },
      },
    }),
    prisma.changeRequest.count({ where: openWhere }),
  ]);

  const authorIds = [...new Set(registros.map((r) => r.authorId))];
  const authors = authorIds.length
    ? await prisma.user.findMany({
      where: { id: { in: authorIds }, companyId: user.companyId },
      select: { id: true, name: true },
    })
    : [];
  const authorMap = new Map(authors.map((a) => [a.id, a.name]));

  return {
    id: partida.id,
    name: partida.name,
    projectId: partida.projectId,
    segment: partida.segment
      ? {
        id: partida.segment.id,
        name: partida.segment.name,
        closedAt: partida.segment.closedAt?.toISOString() ?? null,
      }
      : null,
    progressPct: partida.progressPct,
    completedAt: partida.completedAt?.toISOString() ?? null,
    registroCount: partida._count.registros,
    openRequestCount,
    canEdit,
    tags: partida.tags.map((x) => x.tag.name),
    registros: registros.map((r) => ({
      id: r.id,
      text: r.text ? r.text.slice(0, TEXT_LIMIT) : null,
      category: r.category,
      locationLabel: r.location?.label ?? null,
      serverCreatedAt: r.serverCreatedAt.toISOString(),
      authorName: authorMap.get(r.authorId) ?? null,
      attachmentCount: r.attachments.length,
      firstImageUrl: r.attachments.find((a) => a.fileType === "IMAGE")?.url ?? null,
      hashPrefix: r.hash.slice(0, HASH_PREFIX_LEN),
    })),
  };
}
