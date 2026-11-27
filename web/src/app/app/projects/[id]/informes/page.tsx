import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getDict } from "@/i18n/server";
import { projectAccessWhere } from "@/lib/authz/projects";
import { loadProject } from "@/lib/project/load";
import { informeErrorText } from "@/lib/informes/error-text";
import { formatTimestamp } from "@/lib/format/datetime";
import { InformesTab } from "@/components/informes-tab";
import type { Role } from "@prisma/client";

export default async function InformesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const sessionUser = session!.user as { id: string; companyId: string; role: Role };
  const { lang, t } = await getDict();

  // Same 404 for a missing id and another tenant's id.
  const project = await loadProject(id, sessionUser.id, sessionUser.companyId, sessionUser.role);
  if (!project) notFound();

  const allPartidas = [...project.segments.flatMap((s) => s.partidas), ...project.partidas];

  // R3 WS7 (Agent 4): +archetype select/mapping only — the archetype label
  // needs to reach InformesTab's history list, and this query/mapping is where
  // every other informe row field is already built.
  const informeRows = await prisma.informe.findMany({
    where: { projectId: id, project: projectAccessWhere(sessionUser) },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { id: true, brief: true, createdAt: true, requestedById: true, segmentId: true, partidaId: true, archetype: true, status: true, errorMessage: true },
  });
  const informeRequesterIds = [...new Set(informeRows.map((i) => i.requestedById))];
  const informeRequesters = informeRequesterIds.length
    ? await prisma.user.findMany({ where: { id: { in: informeRequesterIds }, companyId: sessionUser.companyId }, select: { id: true, name: true } })
    : [];
  const informeRequesterMap = new Map(informeRequesters.map((u) => [u.id, u.name]));
  // R3 WS11 missing-seal notice: server-computed, ADMIN/MANAGER only, shown on
  // the informes tab where the PDF download links live.
  const companyHasSeal = Boolean(
    (await prisma.company.findUnique({ where: { id: sessionUser.companyId }, select: { sealKey: true } }))?.sealKey,
  );

  return (
    <InformesTab
      projectId={project.id}
      segments={project.segments.map((s) => ({ id: s.id, name: s.name }))}
      partidas={allPartidas.map((p) => ({ id: p.id, name: p.name }))}
      informes={informeRows.map((i) => ({
        id: i.id,
        brief: i.brief,
        createdAt: formatTimestamp(i.createdAt, lang),
        requesterName: informeRequesterMap.get(i.requestedById) ?? "—",
        scopeLabel: i.partidaId ? t.informes.scopePartida : i.segmentId ? t.informes.scopeSegment : t.informes.scopeProject,
        archetypeLabel: i.archetype === "OWNER" ? t.archetypes.owner
          : i.archetype === "SENIOR_MANAGEMENT" ? t.archetypes.senior
          : i.archetype === "PERSONAL_FEEDBACK" ? t.archetypes.personal
          : t.archetypes.legacy,
        status: i.status,
        errorMessage: informeErrorText(i.errorMessage, t),
      }))}
      t={t.informes}
      archetypes={t.archetypes}
      hasCompanySeal={companyHasSeal}
    />
  );
}
