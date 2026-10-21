import { prisma } from "@/lib/db";
import { projectAccessWhere, type SessionUser } from "@/lib/authz/projects";

export type ProjectSearchResults = {
  partidas: { id: string; name: string }[];
  registros: { id: string; partidaId: string; partidaName: string; text: string | null; serverCreatedAt: Date }[];
  documentos: { id: string; title: string | null; url: string; kind: string }[];
  cambios: { id: string; code: string; title: string }[];
};

const LIMIT = 10;

/**
 * Windows-style similarity search inside one obra (spec R3.2): one query string
 * matched (contains, case-insensitive) against partida names, registro text,
 * document titles or file names, and cambio title/description. Returns null when the obra
 * isn't visible to the caller; empty groups for blank/no-match queries.
 */
export async function searchProject(user: SessionUser, projectId: string, q: string): Promise<ProjectSearchResults | null> {
  const project = await prisma.project.findFirst({ where: { id: projectId, ...projectAccessWhere(user) }, select: { id: true } });
  if (!project) return null;
  const query = q.trim();
  const empty: ProjectSearchResults = { partidas: [], registros: [], documentos: [], cambios: [] };
  if (!query) return empty;

  const contains = { contains: query, mode: "insensitive" as const };
  const [partidas, registros, documentos, cambios] = await Promise.all([
    prisma.partida.findMany({ where: { projectId, deletedAt: null, name: contains }, take: LIMIT, orderBy: { createdAt: "asc" }, select: { id: true, name: true } }),
    prisma.registro.findMany({
      where: { partida: { projectId, deletedAt: null }, text: contains },
      take: LIMIT, orderBy: { serverCreatedAt: "desc" },
      select: { id: true, partidaId: true, text: true, serverCreatedAt: true, partida: { select: { name: true } } },
    }),
    prisma.document.findMany({
      where: { projectId, OR: [{ title: contains }, { fileName: contains }] },
      take: LIMIT, orderBy: { createdAt: "desc" },
      select: { id: true, title: true, url: true, kind: true },
    }),
    prisma.changeRequest.findMany({ where: { projectId, OR: [{ title: contains }, { description: contains }] }, take: LIMIT, orderBy: { createdAt: "desc" }, select: { id: true, code: true, title: true } }),
  ]);
  return {
    partidas,
    registros: registros.map((r) => ({ id: r.id, partidaId: r.partidaId, partidaName: r.partida.name, text: r.text, serverCreatedAt: r.serverCreatedAt })),
    documentos,
    cambios,
  };
}
