import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import Link from "next/link";
import { getDict } from "@/i18n/server";
import { ProjectFileTree } from "@/components/project-file-tree";
import { projectProgress } from "@/lib/project/progress";

export default async function ProjectPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ p?: string }>;
}) {
  const { id } = await params;
  const { p: selectedId } = await searchParams;
  const session = await auth();
  const companyId = (session!.user as { companyId: string }).companyId;
  const { t } = await getDict();
  const P = t.project;

  // Tenant scoping: only return the project if it belongs to the caller's company.
  const project = await prisma.project.findFirstOrThrow({
    where: { id, companyId },
    include: {
      company: { select: { name: true } },
      segments: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        include: { partidas: { orderBy: { createdAt: "asc" } } },
      },
      partidas: { where: { segmentId: null }, orderBy: { createdAt: "asc" } },
    },
  });

  const allPartidas = [...project.segments.flatMap((s) => s.partidas), ...project.partidas];
  const avg = projectProgress(allPartidas);
  const segmentNames = project.segments.map((s) => s.name);

  return (
    <div className="reveal">
      <Link href="/app" className="kicker" style={{ textDecoration: "none" }}>← {P.back}</Link>
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "10px 0 2px" }}>
        <h1 className="h-lg" style={{ fontSize: "clamp(1.8rem, 4vw, 2.6rem)" }}>{project.name}</h1>
        <span className={`state-badge ${project.archivedAt ? "is-archived" : "is-active"}`}>
          {project.archivedAt ? P.statusArchived : P.statusActive}
        </span>
      </div>
      <div className="mono text-steel" style={{ fontSize: "0.78rem" }}>
        {project.company.name} · {allPartidas.length} {P.partidasWord} · {avg}%
      </div>

      <div className="tabs">
        <span className="tab is-on">📁 {P.tabCode}</span>
        <span className="tab is-off">🔀 {P.tabChanges} <span className="soon">{P.soon}</span></span>
        <span className="tab is-off">📊 {P.tabAnalytics} <span className="soon">{P.soon}</span></span>
        <span className="tab is-off">⚙️ {P.tabSettings} <span className="soon">{P.soon}</span></span>
      </div>

      <div className="workspace">
        <ProjectFileTree
          projectId={project.id}
          segments={project.segments}
          ungrouped={project.partidas}
          segmentNames={segmentNames}
          selectedId={selectedId}
          t={{ ungrouped: P.ungrouped, newPartida: P.newPartida, add: P.add, segmentPlaceholder: P.segmentPlaceholder, newSegment: P.newSegment, addSegment: P.addSegment }}
        />
        <div className="viewport">
          <div className="empty">{P.summaryEmpty}</div>
        </div>
      </div>
    </div>
  );
}
