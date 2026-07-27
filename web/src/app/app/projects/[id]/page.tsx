import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import Link from "next/link";
import { getDict } from "@/i18n/server";
import { ProjectFileTree } from "@/components/project-file-tree";
import { PartidaSummary } from "@/components/partida-summary";
import { CambiosList } from "@/components/cambios-list";
import { PlanosTab } from "@/components/planos-tab";
import { AnaliticaTab } from "@/components/analitica-tab";
import { InformesTab } from "@/components/informes-tab";
import { Layers, Branch, BarChart, Sliders, Folder, FileText } from "@/components/icons";
import { formatTimestamp } from "@/lib/format/datetime";
import { projectProgress } from "@/lib/project/progress";
import { filterPartidaGroups } from "@/lib/project/partida-filter";
import { PartidaRecycle } from "@/components/partida-recycle";
import { RenameProjectForm } from "@/components/project-edit-controls";
import { ArchiveButton } from "@/components/archive-button";
import { PurgeProjectButton } from "@/components/purge-project-button";
import { restoreProject, updateProjectCover } from "@/app/actions/admin";
import { registrationQrDataUrl } from "@/lib/project/qr";
import { SubmitButton } from "@/components/submit-button";
import { ProjectAssignmentsPanel } from "@/components/project-assignments-panel";
import { hasCompanyWideAccess, projectAccessWhere } from "@/lib/authz/projects";
import { BloqueSpacesPanel, type SpaceKey } from "@/components/bloque-spaces-panel";
import { Breadcrumbs } from "@/components/breadcrumbs";
import type { DocumentKind, Role } from "@prisma/client";
import { BloqueCards } from "@/components/bloque-cards";
import { ProjectSearchResultsPanel } from "@/components/project-search-results";
import { MediaGalleries, isMediaTab, type MediaItem, type MediaTab } from "@/components/media-galleries";
import { searchProject } from "@/lib/project/search";
import { UNGROUPED_FILTER } from "@/lib/project/partida-filter";

export default async function ProjectPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ p?: string; tab?: string; q?: string; block?: string; space?: string; media?: string; mpage?: string; tags?: string | string[]; pmin?: string; pmax?: string; cambios?: string; ffrom?: string; fto?: string }>;
}) {
  const { id } = await params;
  const { p: selectedId, tab, q, block, space, media, mpage, tags, pmin, pmax, cambios, ffrom, fto } = await searchParams;
  const session = await auth();
  const sessionUser = session!.user as { id: string; companyId: string; role: Role };
  const companyId = sessionUser.companyId;
  const isAdmin = hasCompanyWideAccess(sessionUser.role);
  const isOwner = sessionUser.role === "ADMIN"; // delete/recycle is ADMIN-only
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
        include: {
          partidas: {
            where: { deletedAt: null },
            orderBy: { createdAt: "asc" },
            include: { tags: { include: { tag: { select: { name: true } } } } },
          },
        },
      },
      partidas: {
        where: { segmentId: null, deletedAt: null },
        orderBy: { createdAt: "asc" },
        include: { tags: { include: { tag: { select: { name: true } } } } },
      },
    },
  });

  const allPartidas = [...project.segments.flatMap((s) => s.partidas), ...project.partidas];
  const canEditStructure = isAdmin || project.assignments.some((a) => a.userId === sessionUser.id);
  const avg = projectProgress(allPartidas);
  const segmentOptions = project.segments.map((s) => ({ id: s.id, name: s.name }));
  const segmentSummaries = project.segments.map((s) => ({
    id: s.id,
    name: s.name,
    progress: projectProgress(s.partidas),
    count: s.partidas.length,
    closedAt: s.closedAt,
  }));

  const activeTab = tab === "cambios" ? "cambios" : tab === "planos" ? "planos" : tab === "analitica" ? "analitica" : tab === "informes" ? "informes" : "code";
  const blockParam = String(block ?? "");
  const inBloqueView = activeTab === "code" && Boolean(blockParam);
  // WS4F: `block` is the ONLY canonical param for the active bloque — the
  // workspace (file tree + spaces panel) both derive from it directly. There
  // is no second `spaceBlock` param to reconcile anymore (that mismatch was
  // the bug: bloque-spaces-panel's own links used `spaceBlock`, dropping
  // `block` and silently kicking the page out of the workspace view).
  const selectedSpaceBlock = inBloqueView
    ? (segmentSummaries.some((s) => s.id === blockParam) ? blockParam : (segmentSummaries[0]?.id ?? null))
    : null;
  // The active bloque's lifecycle state, for the file-tree creation gate
  // (WS4C). null when the workspace is scoped to "Sin bloque" (ungrouped) —
  // ungrouped partidas have no block lifecycle to respect.
  const activeSegment = inBloqueView && blockParam !== UNGROUPED_FILTER
    ? project.segments.find((s) => s.id === blockParam) ?? null
    : null;
  const selectedSpace = (["cuaderno", "planos", "levantamientos", "ideas", "media", "recordatorios"].includes(String(space))
    ? String(space)
    : "cuaderno") as SpaceKey;
  const spaceKind: Partial<Record<SpaceKey, DocumentKind>> = {
    planos: "PLANO",
    levantamientos: "LEVANTAMIENTO",
    ideas: "IDEA",
  };
  // Facet params — only meaningful in bloque view, but parsed unconditionally so
  // the type is stable. The open-CRs query is gated on inBloqueView.
  const tagsParam = ([] as string[]).concat(tags ?? []).filter(Boolean);
  const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
  const dateOrNull = (v: unknown) => { const d = new Date(String(v ?? "")); return v && !Number.isNaN(d.getTime()) ? d : null; };

  const openCRs = inBloqueView
    ? await prisma.changeRequest.findMany({
        where: { projectId: id, status: "OPEN" },
        select: { partidas: { select: { partidaId: true } }, segments: { select: { segmentId: true } } },
      })
    : [];
  const openPartidaIds = new Set(openCRs.flatMap((c) => c.partidas.map((p) => p.partidaId)));
  const openSegmentIds = new Set(openCRs.flatMap((c) => c.segments.map((sg) => sg.segmentId)));

  const partidaFilters = {
    q: String(q ?? "").trim(),
    block: blockParam,
    tags: tagsParam,
    progressMin: pmin != null && pmin !== "" ? num(pmin) : null,
    progressMax: pmax != null && pmax !== "" ? num(pmax) : null,
    openCambios: cambios === "open",
    createdFrom: dateOrNull(ffrom),
    createdTo: dateOrNull(fto),
  };
  const filteredPartidas = inBloqueView
    ? (() => {
        const enrich = <T extends { id: string; segmentId?: string | null; progressPct: number; createdAt: Date; tags: { tag: { name: string } }[] }>(p: T) => ({
          ...p,
          tagNames: p.tags.map((tp) => tp.tag.name),
          hasOpenCambios: openPartidaIds.has(p.id) || (p.segmentId ? openSegmentIds.has(p.segmentId) : false),
        });
        const enrichedSegments = project.segments.map((s) => ({
          ...s,
          partidas: s.partidas.map(enrich),
        }));
        const enrichedUngrouped = project.partidas.map(enrich);
        return filterPartidaGroups(enrichedSegments, enrichedUngrouped, {
          query: partidaFilters.q,
          segmentId: partidaFilters.block,
          tags: partidaFilters.tags,
          progressMin: partidaFilters.progressMin,
          progressMax: partidaFilters.progressMax,
          openCambios: partidaFilters.openCambios,
          createdFrom: partidaFilters.createdFrom,
          createdTo: partidaFilters.createdTo,
        });
      })()
    : { segments: [], ungrouped: [], total: 0, hasFilters: false };

  const tagCounts = new Map<string, number>();
  if (inBloqueView) {
    for (const p of [...project.segments.flatMap((s) => s.partidas), ...project.partidas]) {
      for (const tp of p.tags) tagCounts.set(tp.tag.name, (tagCounts.get(tp.tag.name) ?? 0) + 1);
    }
  }
  // hasActive = facet filters are active (excludes q and block which have their own clear mechanism)
  const hasActiveFacets = tagsParam.length > 0 || partidaFilters.progressMin != null || partidaFilters.progressMax != null || partidaFilters.openCambios || !!ffrom || !!fto;

  const changeRows = activeTab === "cambios"
    ? (await prisma.changeRequest.findMany({
        where: { projectId: id },
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { partidas: true, segments: true } } },
      })).map((c) => ({
        id: c.id, code: c.code, title: c.title, status: c.status,
        kind: c.kind, severity: c.severity,
        createdAt: c.createdAt, seal: c.seal,
        segmentCount: c._count.segments || c._count.partidas,
      }))
    : [];

  const docs = activeTab === "planos"
    ? await prisma.document.findMany({ where: { projectId: id, kind: { in: ["PLANO", "PLANO_ACTUALIZADO"] } }, orderBy: { createdAt: "desc" } })
    : [];
  const spaceDocs = activeTab === "code" && inBloqueView && selectedSpaceBlock && spaceKind[selectedSpace]
    ? await prisma.document.findMany({
        where: {
          projectId: id,
          segmentId: selectedSpaceBlock,
          kind: selectedSpace === "planos"
            ? { in: ["PLANO", "PLANO_ACTUALIZADO"] }
            : spaceKind[selectedSpace],
        },
        orderBy: { createdAt: "desc" },
      })
    : [];
  const spaceNotes = activeTab === "code" && inBloqueView && selectedSpaceBlock && selectedSpace === "cuaderno"
    ? (await prisma.registro.findMany({
        where: { partida: { projectId: id, segmentId: selectedSpaceBlock, deletedAt: null } },
        orderBy: [{ serverCreatedAt: "desc" }, { id: "desc" }],
        take: 20,
        select: { id: true, partidaId: true, text: true, serverCreatedAt: true, hash: true, partida: { select: { name: true } } },
      })).map((r) => ({ id: r.id, partidaId: r.partidaId, text: r.text, serverCreatedAt: r.serverCreatedAt, hash: r.hash, partidaName: r.partida.name }))
    : [];
  const spaceMedia = activeTab === "code" && inBloqueView && selectedSpaceBlock && selectedSpace === "media"
    ? (await prisma.attachment.findMany({
        where: { registro: { partida: { projectId: id, segmentId: selectedSpaceBlock, deletedAt: null } } },
        orderBy: { id: "desc" },
        take: 60,
        select: { id: true, url: true, fileType: true, registro: { select: { text: true, serverCreatedAt: true } } },
      })).map((a) => ({ id: a.id, url: a.url, fileType: a.fileType, text: a.registro.text, createdAt: a.registro.serverCreatedAt }))
    : [];
  const now = new Date();
  const openCambios = activeTab === "analitica"
    ? await prisma.changeRequest.count({ where: { projectId: id, status: "OPEN" } })
    : 0;
  const overdueReminders = activeTab === "analitica"
    ? await prisma.registro.count({ where: { partida: { projectId: id, deletedAt: null }, reminderDueAt: { lt: now }, reminderResolvedAt: null } })
    : 0;
  // WS6: `completed` (Partida.completedAt != null) threads the real lifecycle
  // state through so the analítica progress bar only shows green ("is-done")
  // for an actually-concluded partida, never for an aggregate that happens to
  // read 100%.
  const analiticaBloques = project.segments.map((s) => ({
    id: s.id, name: s.name, progress: projectProgress(s.partidas),
    partidas: s.partidas.map((p) => ({ id: p.id, name: p.name, progressPct: p.progressPct, completed: p.completedAt != null })),
  }));
  const analiticaUngrouped = project.partidas.map((p) => ({ id: p.id, name: p.name, progressPct: p.progressPct, completed: p.completedAt != null }));
  const reminderRows = activeTab === "code" && inBloqueView && selectedSpaceBlock
    ? await prisma.registro.findMany({
        where: {
          partida: { projectId: id, segmentId: selectedSpaceBlock, deletedAt: null },
          reminderDueAt: { not: null },
          reminderResolvedAt: null,
        },
        orderBy: { reminderDueAt: "asc" },
        take: 20,
        select: { id: true, partidaId: true, text: true, serverCreatedAt: true, hash: true, partida: { select: { name: true } } },
      })
    : [];
  const spaceReminders = reminderRows.map((r) => ({ id: r.id, partidaId: r.partidaId, text: r.text, serverCreatedAt: r.serverCreatedAt, hash: r.hash, partidaName: r.partida.name }));
  // Overview data — only computed when NOT in the bloque workspace view.
  const searchResults = !inBloqueView && activeTab === "code" && partidaFilters.q
    ? await searchProject(sessionUser, id, partidaFilters.q)
    : null;

  // Deletable = empty by the same rule the action enforces.
  const segmentIdsAll = project.segments.map((s) => s.id);
  const [partidaCounts, docCounts, crCounts] = !inBloqueView && activeTab === "code" && segmentIdsAll.length
    ? await Promise.all([
        prisma.partida.groupBy({ by: ["segmentId"], where: { segmentId: { in: segmentIdsAll } }, _count: { _all: true } }),
        prisma.document.groupBy({ by: ["segmentId"], where: { segmentId: { in: segmentIdsAll } }, _count: { _all: true } }),
        prisma.changeRequestSegment.groupBy({ by: ["segmentId"], where: { segmentId: { in: segmentIdsAll } }, _count: { _all: true } }),
      ])
    : [[], [], []];
  const nonEmpty = new Set<string>([
    ...partidaCounts.map((c) => c.segmentId as string),
    ...docCounts.map((c) => c.segmentId as string),
    ...crCounts.map((c) => c.segmentId as string),
  ].filter(Boolean));
  const bloqueCards = segmentSummaries.map((s) => ({ ...s, deletable: !nonEmpty.has(s.id) }));

  // Media gallery data.
  const MEDIA_PAGE = 24;
  const mediaTab = isMediaTab(String(media ?? "")) ? (String(media) as MediaTab) : "fotos";
  const mediaPage = Math.max(1, Number(mpage ?? "1") || 1);
  const mediaType = ({ fotos: "IMAGE", videos: "VIDEO", documentos: "PDF", audio: "AUDIO" } as const)[mediaTab];
  let mediaItems: MediaItem[] = [];
  let mediaHasMore = false;
  if (!inBloqueView && activeTab === "code") {
    const atts = await prisma.attachment.findMany({
      where: { fileType: mediaType, registro: { partida: { projectId: id, deletedAt: null } } },
      orderBy: { id: "desc" },
      skip: (mediaPage - 1) * MEDIA_PAGE,
      take: MEDIA_PAGE + 1,
      select: { id: true, url: true, registro: { select: { serverCreatedAt: true, partida: { select: { name: true } } } } },
    });
    mediaHasMore = atts.length > MEDIA_PAGE;
    mediaItems = atts.slice(0, MEDIA_PAGE).map((a) => ({
      id: a.id, url: a.url,
      label: a.registro.partida.name,
      date: formatTimestamp(a.registro.serverCreatedAt, lang).slice(0, 10),
      kind: mediaTab === "fotos" ? "image" : mediaTab === "videos" ? "video" : mediaTab === "audio" ? "audio" : "pdf",
    }));
    if (mediaTab === "documentos" && mediaPage === 1) {
      // Uploaded documents (planos, minutas, etc.) join the PDF attachments on page 1.
      const docs2 = await prisma.document.findMany({
        where: { projectId: id },
        orderBy: { createdAt: "desc" },
        take: MEDIA_PAGE,
        select: { id: true, url: true, title: true, kind: true, createdAt: true },
      });
      mediaItems = [
        ...docs2.map((d) => ({ id: d.id, url: d.url, label: d.title ?? d.kind, date: formatTimestamp(d.createdAt, lang).slice(0, 10), kind: "doc" as const })),
        ...mediaItems,
      ].slice(0, MEDIA_PAGE * 2);
    }
  }

  const uploaderIds = [...new Set(docs.map((d) => d.uploadedById))];
  const uploaders = uploaderIds.length
    ? await prisma.user.findMany({ where: { id: { in: uploaderIds }, companyId }, select: { id: true, name: true } })
    : [];
  const docAuthorMap = new Map(uploaders.map((u) => [u.id, u.name]));

  // R3 WS7 (Agent 4): +archetype select/mapping only — flagged per the R3
  // dispatch brief as a minimal cross-file touch in Agent 3's file (the
  // archetype label needs to reach InformesTab's history list, and this
  // query/mapping is where every other informe row field is already built).
  const informeRows = activeTab === "informes"
    ? await prisma.informe.findMany({
        where: { projectId: id, project: projectAccessWhere(sessionUser) },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: { id: true, brief: true, createdAt: true, requestedById: true, segmentId: true, partidaId: true, archetype: true },
      })
    : [];
  const informeRequesterIds = [...new Set(informeRows.map((i) => i.requestedById))];
  const informeRequesters = informeRequesterIds.length
    ? await prisma.user.findMany({ where: { id: { in: informeRequesterIds }, companyId }, select: { id: true, name: true } })
    : [];
  const informeRequesterMap = new Map(informeRequesters.map((u) => [u.id, u.name]));

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

  const deletedPartidas = activeTab === "code" && inBloqueView && isOwner
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
      <Breadcrumbs
        ariaLabel={t.breadcrumb.aria}
        items={[
          { label: t.nav.sites, href: "/app" },
          { label: project.name },
        ]}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "10px 0 2px" }}>
        {project.coverImageKey && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/media/${project.coverImageKey}`} alt="" style={{ width: 52, height: 52, objectFit: "cover", borderRadius: "var(--radius-sm)", flexShrink: 0 }} />
        )}
        <h1 className="h-lg" style={{ fontSize: "clamp(1.8rem, 4vw, 2.6rem)" }}>{project.name}</h1>
        <span className={`state-badge ${project.archivedAt ? "is-archived" : "is-active"}`}>
          {project.archivedAt ? P.statusArchived : P.statusActive}
        </span>
        {isAdmin && <RenameProjectForm projectId={project.id} currentName={project.name} t={{ rename: P.rename, save: P.save, move: P.move, moveTo: P.moveTo, ungrouped: P.ungrouped }} />}
      </div>
      {(project.ownerName || project.description) && (
        <div className="mono text-steel" style={{ fontSize: "0.78rem", display: "flex", flexDirection: "column", gap: 2, margin: "2px 0" }}>
          {project.ownerName && <span>{t.projectFields.owner}: {project.ownerName}</span>}
          {project.description && <span>{t.projectFields.generalDescription}: {project.description}</span>}
        </div>
      )}
      <div className="mono text-steel" style={{ fontSize: "0.78rem", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span>{project.company.name} · {allPartidas.length} {P.partidasWord} · {avg}%</span>
        <span className="sep">·</span>
        <span title={P.registrationCode}>{project.registrationCode}</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={await registrationQrDataUrl(project.registrationCode, 64)} alt={project.registrationCode} style={{ width: 44, height: 44 }} />
      </div>
      {isOwner && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
          <form action={updateProjectCover} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <input type="hidden" name="projectId" value={project.id} />
            <input type="file" name="cover" required accept="image/jpeg,image/png,image/webp" style={{ fontSize: "0.72rem", maxWidth: 180 }} />
            <SubmitButton className="btn btn-ghost" style={{ padding: "0.25rem 0.65rem", fontSize: "0.72rem" }}>{P.changeCover}</SubmitButton>
          </form>
          {project.archivedAt ? (
            <>
              <form action={restoreProject} style={{ display: "inline" }}>
                <input type="hidden" name="projectId" value={project.id} />
                <button type="submit" className="btn btn-ghost" style={{ padding: "0.25rem 0.65rem", fontSize: "0.72rem" }}>{P.restoreProject}</button>
              </form>
              <PurgeProjectButton projectId={project.id} t={{ purge: t.dash.purge, purgeConfirm: t.dash.purgeConfirm, yes: t.dash.yes, no: t.dash.no }} />
            </>
          ) : (
            <ArchiveButton projectId={project.id} t={{ archive: t.dash.archive, confirm: t.dash.confirm, yes: t.dash.yes, no: t.dash.no }} />
          )}
        </div>
      )}
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
        <Link href={`/app/projects/${id}?tab=cambios`} className={`tab ${activeTab === "cambios" ? "is-on" : ""}`} aria-current={activeTab === "cambios" ? "page" : undefined}><Branch size={13} />{t.requests.tab}</Link>
        <Link href={`/app/projects/${id}?tab=analitica`} className={`tab ${activeTab === "analitica" ? "is-on" : ""}`} aria-current={activeTab === "analitica" ? "page" : undefined}><BarChart size={13} />{P.tabAnalytics}</Link>
        <Link href={`/app/projects/${id}?tab=informes`} className={`tab ${activeTab === "informes" ? "is-on" : ""}`} aria-current={activeTab === "informes" ? "page" : undefined}><FileText size={13} />{P.tabInformes}</Link>
        <span className="tab is-off" aria-disabled="true"><Sliders size={13} />{P.tabSettings} <span className="soon">{P.soon}</span></span>
      </div>

      {activeTab === "cambios" ? (
        <div style={{ marginTop: 16 }}>
          <CambiosList
            projectId={project.id}
            rows={changeRows}
            partidas={segmentOptions}
            lang={lang}
            t={{
              empty: t.changes.empty, states: t.changes.states,
              new: t.changes.new, fieldTitle: t.changes.fieldTitle, fieldDescription: t.changes.fieldDescription,
              fieldPartidas: t.changes.fieldPartidas,
              fieldReminder: t.changes.fieldReminder, fieldReminderPlaceholder: t.changes.fieldReminderPlaceholder,
              evidence: t.changes.evidence,
              kindLabel: t.requests.kindLabel, kindChange: t.requests.kindChange, kindAlert: t.requests.kindAlert,
              severityLabel: t.requests.severityLabel, severityImportant: t.requests.severityImportant, severityCritical: t.requests.severityCritical,
              gpsAcquiring: t.requests.gpsAcquiring, gpsAcquired: t.requests.gpsAcquired, gpsDenied: t.requests.gpsDenied,
              gpsUnavailable: t.requests.gpsUnavailable, gpsTimeout: t.requests.gpsTimeout, gpsInvalid: t.requests.gpsInvalid,
              gpsRetry: t.requests.gpsRetry,
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
            t={{ empty: t.planos.empty, upload: t.planos.uploadByKind.PLANO, title: t.planos.title, error: t.planos.error, uploadedBy: t.planos.uploadedBy, view: t.planos.view }}
          />
        </div>
      ) : activeTab === "analitica" ? (
        <AnaliticaTab
          general={{ progress: avg, partidas: allPartidas.length, openCambios, overdueReminders }}
          bloques={analiticaBloques}
          ungrouped={analiticaUngrouped}
          t={{ general: P.analiticaGeneral, byBloque: P.analiticaByBloque, openChanges: P.analiticaOpenChanges, overdue: P.analiticaOverdue, partidasWord: P.partidasWord, noBloques: P.analiticaNoBloques }}
        />
      ) : activeTab === "informes" ? (
        <InformesTab
          projectId={project.id}
          segments={segmentOptions}
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
          }))}
          t={t.informes}
          archetypes={t.archetypes}
        />
      ) : inBloqueView ? (
        <>
          <Link href={`/app/projects/${project.id}`} className="kicker" style={{ textDecoration: "none", display: "inline-block", margin: "12px 0 0" }}>
            ← {P.backToBloques}
          </Link>
          <div className="workspace">
            <ProjectFileTree
              projectId={project.id}
              segments={filteredPartidas.segments}
              ungrouped={filteredPartidas.ungrouped}
              segmentOptions={segmentOptions}
              selectedId={selectedId}
              isAdmin={canEditStructure}
              filters={{ ...partidaFilters, total: filteredPartidas.total, hasFilters: filteredPartidas.hasFilters }}
              facets={{
                tagCounts: [...tagCounts.entries()],
                selected: { tags: partidaFilters.tags, progressMin: partidaFilters.progressMin, progressMax: partidaFilters.progressMax, openCambios: partidaFilters.openCambios, createdFrom: String(ffrom ?? ""), createdTo: String(fto ?? "") },
                hasActive: hasActiveFacets,
              }}
              activeBlock={activeSegment ? { id: activeSegment.id, name: activeSegment.name, closedAt: activeSegment.closedAt } : null}
              t={{
                ungrouped: P.ungrouped, newPartida: P.newPartida, add: P.add,
                segmentPlaceholder: P.segmentPlaceholder, newSegment: P.newSegment,
                addSegment: P.addSegment, rename: P.rename, save: P.save,
                move: P.move, moveTo: P.moveTo, searchPartidas: P.searchPartidas,
                allBlocks: P.allBlocks, filter: P.filter, clear: P.clear,
                noResults: P.noResults,
                facetTags: P.facetTags, facetProgress: P.facetProgress,
                facetProgressMin: P.facetProgressMin, facetProgressMax: P.facetProgressMax,
                facetOpenCambios: P.facetOpenCambios, facetCreated: P.facetCreated,
                blockClosedNoCreate: t.lifecycle.blockClosedNoCreate,
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
          <BloqueSpacesPanel
            projectId={project.id}
            segments={segmentSummaries}
            selectedSegmentId={selectedSpaceBlock}
            selectedSpace={selectedSpace}
            docs={spaceDocs}
            notes={spaceNotes}
            media={spaceMedia}
            reminders={spaceReminders}
            canUpload={canEditStructure}
            canResolve={canEditStructure}
            canManageLifecycle={canEditStructure}
            preserved={{ p: selectedId, q: partidaFilters.q, tags: tagsParam, pmin: pmin ?? null, pmax: pmax ?? null, cambios: cambios ?? null, ffrom: ffrom ?? null, fto: fto ?? null }}
            lang={lang}
            t={{
              emptyDocs: t.planos.empty, upload: t.planos.upload, uploadByKind: t.planos.uploadByKind, title: t.planos.title, error: t.planos.error, uploadedBy: t.planos.uploadedBy, view: t.planos.view, resolve: P.resolveReminder,
              blockClosed: t.lifecycle.blockClosed, closeBlock: t.lifecycle.closeBlock, reopenBlock: t.lifecycle.reopenBlock,
            }}
          />
          <PartidaRecycle
            rows={deletedPartidas}
            deleterMap={deleterMap}
            lang={lang}
            canPurge={sessionUser.role === "ADMIN"}
            t={{ recycleTitle: P.recycleTitle, restore: P.restore, deleteForever: P.deleteForever, deletedBy: P.deletedBy, hasRecords: P.hasRecords }}
          />
        </>
      ) : (
        <>
          <BloqueCards
            projectId={project.id}
            bloques={bloqueCards}
            ungroupedCount={project.partidas.length}
            canEdit={canEditStructure}
            isOwner={isOwner}
            t={{
              bloquesTitle: P.bloquesTitle, bloqueCard: P.bloqueCard, openBloque: P.openBloque, ungrouped: P.ungrouped, newSegment: P.newSegment, addSegment: P.addSegment, deleteBloque: P.deleteBloque, deleteBloqueConfirm: P.deleteBloqueConfirm, yes: P.yes, no: P.no,
              blockClosed: t.lifecycle.blockClosed, closeBlock: t.lifecycle.closeBlock, reopenBlock: t.lifecycle.reopenBlock,
            }}
          />
          <form action={`/app/projects/${project.id}`} style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <input name="q" defaultValue={partidaFilters.q} placeholder={P.searchObra} className="search-input" style={{ flex: 1 }} />
            <SubmitButton className="btn btn-ghost" style={{ fontSize: "0.78rem" }}>{P.filter}</SubmitButton>
          </form>
          {partidaFilters.q && searchResults && (
            <ProjectSearchResultsPanel projectId={project.id} results={searchResults} t={{ searchResults: P.searchResults, searchNoResults: P.searchNoResults, searchInPartidas: P.searchInPartidas, searchInRegistros: P.searchInRegistros, searchInDocumentos: P.searchInDocumentos, searchInCambios: P.searchInCambios }} />
          )}
          <MediaGalleries
            projectId={project.id}
            tab={mediaTab}
            items={mediaItems}
            page={mediaPage}
            hasMore={mediaHasMore}
            t={{ mediaTitle: P.mediaTitle, mediaFotos: P.mediaFotos, mediaVideos: P.mediaVideos, mediaDocumentos: P.mediaDocumentos, mediaAudio: P.mediaAudio, mediaEmpty: P.mediaEmpty, older: t.pager.older, newer: t.pager.newer }}
          />
        </>
      )}
    </div>
  );
}
