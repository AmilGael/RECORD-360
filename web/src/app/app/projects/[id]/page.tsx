import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import Link from "next/link";
import { getDict } from "@/i18n/server";
import { ProjectFileTree } from "@/components/project-file-tree";
import { PartidaSummary } from "@/components/partida-summary";
import { CambiosList } from "@/components/cambios-list";
import { PlanosTab } from "@/components/planos-tab";
import { Layers, Branch, BarChart, Sliders, Folder } from "@/components/icons";
import { projectProgress } from "@/lib/project/progress";
import { filterPartidaGroups } from "@/lib/project/partida-filter";
import { PartidaRecycle } from "@/components/partida-recycle";
import { RenameProjectForm } from "@/components/project-edit-controls";
import { ProjectAssignmentsPanel } from "@/components/project-assignments-panel";
import { hasCompanyWideAccess, projectAccessWhere } from "@/lib/authz/projects";
import type { Role } from "@prisma/client";

export default async function ProjectPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ p?: string; tab?: string; q?: string; block?: string }>;
}) {
  const { id } = await params;
  const { p: selectedId, tab, q, block } = await searchParams;
  const session = await auth();
  const sessionUser = session!.user as { id: string; companyId: string; role: Role };
  const companyId = sessionUser.companyId;
  const isAdmin = hasCompanyWideAccess(sessionUser.role);
  const { lang, t } = await getDict();
  const P = t.project;

  // Tenant scoping: only return the project if it belongs to the caller's company.
  const project = await prisma.project.findFirstOrThrow({
    where: { id, ...projectAccessWhere(sessionUser) },
    include: {
      company: { select: { name: true } },
      assignments: {
        include: { user: { select: { name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      },
      segments: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        include: { partidas: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } } },
      },
      partidas: { where: { segmentId: null, deletedAt: null }, orderBy: { createdAt: "asc" } },
    },
  });

  const allPartidas = [...project.segments.flatMap((s) => s.partidas), ...project.partidas];
  const canEditStructure = isAdmin || project.assignments.some((a) => a.userId === sessionUser.id);
  const avg = projectProgress(allPartidas);
  const segmentNames = project.segments.map((s) => s.name);
  const segmentOptions = project.segments.map((s) => ({ id: s.id, name: s.name }));

  const activeTab = tab === "cambios" ? "cambios" : tab === "planos" ? "planos" : "code";
  const partidaFilters = {
    q: String(q ?? "").trim(),
    block: String(block ?? ""),
  };
  const filteredPartidas = filterPartidaGroups(project.segments, project.partidas, {
    query: partidaFilters.q,
    segmentId: partidaFilters.block,
  });

  const changeRows = activeTab === "cambios"
    ? (await prisma.changeRequest.findMany({
        where: { projectId: id },
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { partidas: true } } },
      })).map((c) => ({
        id: c.id, code: c.code, title: c.title, status: c.status,
        costImpact: c.costImpact ? c.costImpact.toString() : null,
        daysImpact: c.daysImpact, createdAt: c.createdAt, seal: c.seal,
        partidaCount: c._count.partidas,
      }))
    : [];

  const docs = activeTab === "planos"
    ? await prisma.document.findMany({ where: { projectId: id, kind: "PLANO" }, orderBy: { createdAt: "desc" } })
    : [];
  const uploaderIds = [...new Set(docs.map((d) => d.uploadedById))];
  const uploaders = uploaderIds.length
    ? await prisma.user.findMany({ where: { id: { in: uploaderIds }, companyId }, select: { id: true, name: true } })
    : [];
  const docAuthorMap = new Map(uploaders.map((u) => [u.id, u.name]));

  const selected = selectedId
    ? await prisma.partida.findFirst({
        where: { id: selectedId, projectId: id, deletedAt: null },
        include: {
          registros: {
            orderBy: [{ serverCreatedAt: "desc" }, { id: "desc" }],
            take: 3,
            include: { attachments: true, location: true },
          },
        },
      })
    : null;
  // Registro.authorId has no User relation; resolve the latest author's name directly.
  const latestAuthorId = selected?.registros[0]?.authorId ?? null;
  const authorName = latestAuthorId
    ? (await prisma.user.findFirst({ where: { id: latestAuthorId, companyId }, select: { name: true } }))?.name ?? null
    : null;

  const deletedPartidas = activeTab === "code" && canEditStructure
    ? await prisma.partida.findMany({
        where: { projectId: id, deletedAt: { not: null } },
        include: { _count: { select: { registros: true } } },
        orderBy: { deletedAt: "desc" },
      })
    : [];
  const deleterIds = [...new Set(deletedPartidas.map((p) => p.deletedById).filter((x): x is string => !!x))];
  const deleters = deleterIds.length
    ? await prisma.user.findMany({ where: { id: { in: deleterIds }, companyId }, select: { id: true, name: true } })
    : [];
  const deleterMap = new Map(deleters.map((u) => [u.id, u.name]));
  const assignableUsers = isAdmin
    ? await prisma.user.findMany({
        where: { companyId, role: { in: ["SUPERVISOR", "RESIDENT"] } },
        orderBy: [{ role: "asc" }, { name: "asc" }],
        select: { id: true, name: true, email: true, role: true },
      })
    : [];

  return (
    <div className="reveal">
      <Link href="/app" className="kicker" style={{ textDecoration: "none" }}>← {P.back}</Link>
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "10px 0 2px" }}>
        <h1 className="h-lg" style={{ fontSize: "clamp(1.8rem, 4vw, 2.6rem)" }}>{project.name}</h1>
        <span className={`state-badge ${project.archivedAt ? "is-archived" : "is-active"}`}>
          {project.archivedAt ? P.statusArchived : P.statusActive}
        </span>
        {isAdmin && <RenameProjectForm projectId={project.id} currentName={project.name} t={{ rename: P.rename, save: P.save, move: P.move, moveTo: P.moveTo, ungrouped: P.ungrouped }} />}
      </div>
      <div className="mono text-steel" style={{ fontSize: "0.78rem" }}>
        {project.company.name} · {allPartidas.length} {P.partidasWord} · {avg}%
      </div>
      <ProjectAssignmentsPanel
        projectId={project.id}
        assignments={project.assignments}
        users={assignableUsers}
        canManage={isAdmin}
        t={{
          title: P.assignmentsTitle, supervisor: P.supervisor, resident: P.resident,
          noAssigned: P.noAssigned, assign: P.assign, remove: P.remove,
          chooseUser: P.chooseUser,
        }}
      />

      <div className="tabs">
        <Link href={`/app/projects/${id}?tab=code`} className={`tab ${activeTab === "code" ? "is-on" : ""}`} aria-current={activeTab === "code" ? "page" : undefined}><Layers size={13} />{P.tabPartidas}</Link>
        <Link href={`/app/projects/${id}?tab=planos`} className={`tab ${activeTab === "planos" ? "is-on" : ""}`} aria-current={activeTab === "planos" ? "page" : undefined}><Folder size={13} />{P.tabPlanos}</Link>
        <Link href={`/app/projects/${id}?tab=cambios`} className={`tab ${activeTab === "cambios" ? "is-on" : ""}`} aria-current={activeTab === "cambios" ? "page" : undefined}><Branch size={13} />{P.tabChanges}</Link>
        <span className="tab is-off" aria-disabled="true"><BarChart size={13} />{P.tabAnalytics} <span className="soon">{P.soon}</span></span>
        <span className="tab is-off" aria-disabled="true"><Sliders size={13} />{P.tabSettings} <span className="soon">{P.soon}</span></span>
      </div>

      {activeTab === "cambios" ? (
        <div style={{ marginTop: 16 }}>
          <CambiosList
            projectId={project.id}
            rows={changeRows}
            partidas={allPartidas.map((pa) => ({ id: pa.id, name: pa.name }))}
            lang={lang}
            t={{
              empty: t.changes.empty, states: t.changes.states, days: t.changes.days,
              new: t.changes.new, fieldTitle: t.changes.fieldTitle, fieldDescription: t.changes.fieldDescription,
              fieldPartidas: t.changes.fieldPartidas, impactCost: t.changes.impactCost, impactTime: t.changes.impactTime,
              evidence: t.changes.evidence, gps: t.composer.gps, gpsOk: t.composer.gpsOk,
            }}
          />
        </div>
      ) : activeTab === "planos" ? (
        <div style={{ marginTop: 16 }}>
          <PlanosTab
            projectId={project.id}
            docs={docs}
            authorMap={docAuthorMap}
            lang={lang}
            isAdmin={isAdmin}
            t={{ empty: t.planos.empty, upload: t.planos.upload, title: t.planos.title, error: t.planos.error, uploadedBy: t.planos.uploadedBy, view: t.planos.view }}
          />
        </div>
      ) : (
        <>
          <div className="workspace">
            <ProjectFileTree
              projectId={project.id}
              segments={filteredPartidas.segments}
              ungrouped={filteredPartidas.ungrouped}
              segmentNames={segmentNames}
              segmentOptions={segmentOptions}
              selectedId={selectedId}
              isAdmin={canEditStructure}
              filters={{ ...partidaFilters, total: filteredPartidas.total, hasFilters: filteredPartidas.hasFilters }}
              t={{
                ungrouped: P.ungrouped, newPartida: P.newPartida, add: P.add,
                segmentPlaceholder: P.segmentPlaceholder, newSegment: P.newSegment,
                addSegment: P.addSegment, rename: P.rename, save: P.save,
                move: P.move, moveTo: P.moveTo, searchPartidas: P.searchPartidas,
                allBlocks: P.allBlocks, filter: P.filter, clear: P.clear,
                noResults: P.noResults,
              }}
            />
            {selected ? (
              <PartidaSummary
                partida={selected}
                authorName={authorName}
                lang={lang}
                canEdit={canEditStructure}
                t={{ noEntries: P.summaryNoEntries, lastUpdate: P.lastUpdate, openLog: P.openLog, progress: t.partida.progress, save: P.save }}
              />
            ) : (
              <div className="viewport"><div className="empty">{P.summaryEmpty}</div></div>
            )}
          </div>
          <PartidaRecycle
            rows={deletedPartidas}
            deleterMap={deleterMap}
            lang={lang}
            canPurge={sessionUser.role === "ADMIN"}
            t={{ recycleTitle: P.recycleTitle, restore: P.restore, deleteForever: P.deleteForever, deletedBy: P.deletedBy, hasRecords: P.hasRecords }}
          />
        </>
      )}
    </div>
  );
}
