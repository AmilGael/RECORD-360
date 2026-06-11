import { prisma } from "@/lib/db";
import { projectAccessWhere, type SessionUser } from "@/lib/authz/projects";

export type ReportScope =
  | { type: "project"; id: string }
  | { type: "segment"; id: string }
  | { type: "partida"; id: string };

export type ReportRegistro = {
  partidaName: string;
  serverCreatedAt: Date;
  authorName: string;
  category: string | null;
  locationLabel: string | null;
  gpsLat: number | null;
  gpsLng: number | null;
  text: string | null;
  hash: string;
  attachmentCount: number;
};

export type ReportData = {
  project: { id: string; name: string; registrationCode: string; companyName: string };
  scopeLabel: string;
  from: Date | null;
  to: Date | null;
  partidas: { name: string; progressPct: number; segmentName: string | null }[];
  registros: ReportRegistro[];
  cambios: { code: string; title: string; status: string; createdAt: Date; resolutionNote: string | null }[];
};

/**
 * Assemble tenant-scoped, time-ranged data for a report at any of the three
 * levels. Returns null when the scope isn't visible to the caller — the caller
 * maps that to 404 (no existence oracle). All access flows through
 * projectAccessWhere (company + assignment + archived rules).
 */
export async function assembleReportData(
  user: SessionUser,
  scope: ReportScope,
  from: Date | null,
  to: Date | null,
): Promise<ReportData | null> {
  const accessWhere = projectAccessWhere(user);

  // Resolve the scope to a project + optional narrowing + label.
  let projectId: string;
  let partidaWhere: { segmentId?: string; id?: string } = {};
  let scopeLabel: string;

  if (scope.type === "project") {
    const p = await prisma.project.findFirst({ where: { id: scope.id, ...accessWhere }, select: { id: true } });
    if (!p) return null;
    projectId = p.id;
    scopeLabel = "Obra completa";
  } else if (scope.type === "segment") {
    const seg = await prisma.segment.findFirst({
      where: { id: scope.id, project: accessWhere },
      select: { id: true, name: true, projectId: true },
    });
    if (!seg) return null;
    projectId = seg.projectId;
    partidaWhere = { segmentId: seg.id };
    scopeLabel = `Bloque: ${seg.name}`;
  } else {
    const pa = await prisma.partida.findFirst({
      where: { id: scope.id, deletedAt: null, project: accessWhere },
      select: { id: true, name: true, projectId: true },
    });
    if (!pa) return null;
    projectId = pa.projectId;
    partidaWhere = { id: pa.id };
    scopeLabel = `Partida: ${pa.name}`;
  }

  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { id: true, name: true, registrationCode: true, company: { select: { name: true } } },
  });

  const dateFilter = from || to ? { gte: from ?? undefined, lte: to ?? undefined } : undefined;

  const [partidas, registros, cambios] = await Promise.all([
    prisma.partida.findMany({
      where: { projectId, deletedAt: null, ...partidaWhere },
      orderBy: { createdAt: "asc" },
      select: { name: true, progressPct: true, segment: { select: { name: true } } },
    }),
    prisma.registro.findMany({
      where: {
        partida: { projectId, deletedAt: null, ...partidaWhere },
        ...(dateFilter ? { serverCreatedAt: dateFilter } : {}),
      },
      orderBy: [{ serverCreatedAt: "asc" }, { id: "asc" }],
      select: {
        serverCreatedAt: true, authorId: true, category: true, text: true, hash: true,
        gpsLat: true, gpsLng: true,
        location: { select: { label: true } },
        partida: { select: { name: true } },
        _count: { select: { attachments: true } },
      },
    }),
    // Cambios are obra-level (bloque-scoped via join table) — include them for
    // project scope; for narrower scopes include those touching the bloque.
    prisma.changeRequest.findMany({
      where: {
        projectId,
        ...(dateFilter ? { createdAt: dateFilter } : {}),
        ...(scope.type === "segment" ? { segments: { some: { segmentId: scope.id } } } : {}),
        ...(scope.type === "partida" ? { partidas: { some: { partidaId: scope.id } } } : {}),
      },
      orderBy: { createdAt: "asc" },
      select: { code: true, title: true, status: true, createdAt: true, resolutionNote: true },
    }),
  ]);

  const authorIds = [...new Set(registros.map((r) => r.authorId))];
  const authors = authorIds.length
    ? await prisma.user.findMany({ where: { id: { in: authorIds }, companyId: user.companyId }, select: { id: true, name: true } })
    : [];
  const authorMap = new Map(authors.map((a) => [a.id, a.name]));

  return {
    project: { id: project.id, name: project.name, registrationCode: project.registrationCode, companyName: project.company.name },
    scopeLabel,
    from,
    to,
    partidas: partidas.map((p) => ({ name: p.name, progressPct: p.progressPct, segmentName: p.segment?.name ?? null })),
    registros: registros.map((r) => ({
      partidaName: r.partida.name,
      serverCreatedAt: r.serverCreatedAt,
      authorName: authorMap.get(r.authorId) ?? r.authorId,
      category: r.category,
      locationLabel: r.location?.label ?? null,
      gpsLat: r.gpsLat === null ? null : Number(r.gpsLat),
      gpsLng: r.gpsLng === null ? null : Number(r.gpsLng),
      text: r.text,
      hash: r.hash,
      attachmentCount: r._count.attachments,
    })),
    cambios,
  };
}
