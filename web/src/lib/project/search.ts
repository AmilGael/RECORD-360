import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { projectAccessWhere, type SessionUser } from "@/lib/authz/projects";
import { searchLikePattern } from "@/lib/text/fold";
import { foldedLike } from "@/lib/text/sql-fold";

export type ProjectSearchResults = {
  partidas: { id: string; name: string }[];
  registros: { id: string; partidaId: string; partidaName: string; text: string | null; serverCreatedAt: Date }[];
  documentos: { id: string; title: string | null; url: string; kind: string }[];
  cambios: { id: string; code: string; title: string }[];
};

const LIMIT = 10;

function inOrder<T extends { id: string }>(rows: T[], ids: string[]): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}

async function matchingIds(query: Prisma.Sql): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>(query);
  return rows.map((row) => row.id);
}

/**
 * Windows-style similarity search inside one obra (spec R3.2): one query string
 * matched (contains, case- and accent-insensitive) against partida names, registro text,
 * document titles or file names, and cambio title/description. Returns null when the obra
 * isn't visible to the caller; empty groups for blank/no-match queries.
 */
export async function searchProject(user: SessionUser, projectId: string, q: string): Promise<ProjectSearchResults | null> {
  const project = await prisma.project.findFirst({ where: { id: projectId, ...projectAccessWhere(user) }, select: { id: true } });
  if (!project) return null;
  const empty: ProjectSearchResults = { partidas: [], registros: [], documentos: [], cambios: [] };
  const pattern = searchLikePattern(q);
  if (!pattern) return empty;

  const [partidaIds, registroIds, documentoIds, cambioIds] = await Promise.all([
    matchingIds(Prisma.sql`
      SELECT id FROM "Partida"
      WHERE "projectId" = ${projectId}
        AND "deletedAt" IS NULL
        AND ${foldedLike(Prisma.raw(`name`), pattern)}
      ORDER BY "createdAt" ASC
      LIMIT ${LIMIT}
    `),
    matchingIds(Prisma.sql`
      SELECT r.id FROM "Registro" r
      INNER JOIN "Partida" p ON p.id = r."partidaId"
      WHERE p."projectId" = ${projectId}
        AND p."deletedAt" IS NULL
        AND ${foldedLike(Prisma.raw(`r.text`), pattern)}
      ORDER BY r."serverCreatedAt" DESC
      LIMIT ${LIMIT}
    `),
    matchingIds(Prisma.sql`
      SELECT id FROM "Document"
      WHERE "projectId" = ${projectId}
        AND (
          ${foldedLike(Prisma.raw(`title`), pattern)}
          OR ${foldedLike(Prisma.raw(`"fileName"`), pattern)}
        )
      ORDER BY "createdAt" DESC
      LIMIT ${LIMIT}
    `),
    matchingIds(Prisma.sql`
      SELECT id FROM "ChangeRequest"
      WHERE "projectId" = ${projectId}
        AND (
          ${foldedLike(Prisma.raw(`title`), pattern)}
          OR ${foldedLike(Prisma.raw(`description`), pattern)}
        )
      ORDER BY "createdAt" DESC
      LIMIT ${LIMIT}
    `),
  ]);

  const [partidas, registros, documentos, cambios] = await Promise.all([
    partidaIds.length
      ? prisma.partida.findMany({ where: { id: { in: partidaIds }, projectId, deletedAt: null }, select: { id: true, name: true } })
      : [],
    registroIds.length
      ? prisma.registro.findMany({
          where: { id: { in: registroIds }, partida: { projectId, deletedAt: null } },
          select: { id: true, partidaId: true, text: true, serverCreatedAt: true, partida: { select: { name: true } } },
        })
      : [],
    documentoIds.length
      ? prisma.document.findMany({
          where: { id: { in: documentoIds }, projectId },
          select: { id: true, title: true, url: true, kind: true },
        })
      : [],
    cambioIds.length
      ? prisma.changeRequest.findMany({
          where: { id: { in: cambioIds }, projectId },
          select: { id: true, code: true, title: true },
        })
      : [],
  ]);

  return {
    partidas: inOrder(partidas, partidaIds),
    registros: inOrder(registros, registroIds).map((r) => ({
      id: r.id,
      partidaId: r.partidaId,
      partidaName: r.partida.name,
      text: r.text,
      serverCreatedAt: r.serverCreatedAt,
    })),
    documentos: inOrder(documentos, documentoIds),
    cambios: inOrder(cambios, cambioIds),
  };
}
