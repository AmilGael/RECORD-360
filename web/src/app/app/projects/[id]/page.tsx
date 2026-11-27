import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { notFound, redirect } from "next/navigation";
import { getDict } from "@/i18n/server";
import { PartidaWorkspace } from "@/components/partida-workspace";
import { CambiosList } from "@/components/cambios-list";
import { formatDate } from "@/lib/format/datetime";
import { projectProgress } from "@/lib/project/progress";
import { filterPartidaGroups } from "@/lib/project/partida-filter";
import { PartidaRecycle } from "@/components/partida-recycle";
import { ObraSearch } from "@/components/obra-search";
import { hasCompanyWideAccess } from "@/lib/authz/projects";
import { BloqueSpacesPanel, type SpaceKey } from "@/components/bloque-spaces-panel";
import type { DocumentKind, Role } from "@prisma/client";
import { BloqueCards } from "@/components/bloque-cards";
import { MediaGalleries, isMediaTab, type MediaItem, type MediaTab } from "@/components/media-galleries";
import { searchProject } from "@/lib/project/search";
import { projectHrefWithParams } from "@/lib/project/space-links";
import { UNGROUPED_FILTER } from "@/lib/project/partida-filter";
import { parseDayBound } from "@/lib/time/zone";
import { getPartidaPreview, lastActivityByPartidaIds } from "@/lib/partida/preview";
import { loadProject } from "@/lib/project/load";
import { legacyTabTarget } from "@/lib/project/tabs";
import { requestListLabels } from "@/lib/project/request-list-labels";

// The Partidas tab: the obra overview and the bloque workspace. The header and
// tab strip come from layout.tsx; the other tabs are their own routes.
export default async function ProjectPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ p?: string; pq?: string; tab?: string; q?: string; block?: string; space?: string; media?: string; mpage?: string; tags?: string | string[]; pmin?: string; pmax?: string; cambios?: string; ffrom?: string; fto?: string; rem?: string }>;
}) {
  const { id } = await params;
  const search = await searchParams;
  // Old links that select a tab by query param (bookmarks, notifications stored
  // before the tabs became routes) land on the matching route, other params kept.
  const legacyTarget = legacyTabTarget(id, search);
  if (legacyTarget) redirect(legacyTarget);

  const { p: selectedId, q, block, space, media, mpage, tags, pmin, pmax, cambios, ffrom, fto, rem } = search;
  const session = await auth();
  const sessionUser = session!.user as { id: string; companyId: string; role: Role };
  const isAdmin = hasCompanyWideAccess(sessionUser.role);
  const isOwner = sessionUser.role === "ADMIN"; // delete/recycle is ADMIN-only
  const { lang, t } = await getDict();
  const P = t.project;
  const requestListT = requestListLabels(t);

  // Tenant scoping: only return the project if it belongs to the caller's company.
  // A missing id and another tenant's id both render the same 404.
  const project = await loadProject(id, sessionUser.id, sessionUser.companyId, sessionUser.role);
  if (!project) notFound();

  const canEditStructure = isAdmin || project.assignments.some((a) => a.userId === sessionUser.id);
  const segmentOptions = project.segments.map((s) => ({ id: s.id, name: s.name }));
  const segmentSummaries = project.segments.map((s) => ({
    id: s.id,
    name: s.name,
    progress: projectProgress(s.partidas),
    count: s.partidas.length,
    closedAt: s.closedAt,
  }));

  const blockParam = String(block ?? "");
  const inBloqueView = Boolean(blockParam);
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
  // Unknown/retired space keys fall back to "cuaderno" rather than rendering an
  // empty workspace — this is what keeps bookmarked ?space=planos and
  // ?space=levantamientos links (both retired from the block workspace) landing
  // somewhere useful instead of on a blank panel.
  const selectedSpace = (["cuaderno", "solicitudes", "ideas", "media", "recordatorios"].includes(String(space))
    ? String(space)
    : "cuaderno") as SpaceKey;
  const spaceKind: Partial<Record<SpaceKey, DocumentKind>> = {
    ideas: "IDEA",
  };
  // Facet params — only meaningful in bloque view, but parsed unconditionally so
  // the type is stable. The open-CRs query is gated on inBloqueView.
  const tagsParam = ([] as string[]).concat(tags ?? []).filter(Boolean);
  const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
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
    // Whole local days in APP_TIME_ZONE; "to" includes its entire day.
    createdFrom: parseDayBound(ffrom, "start") ?? null,
    createdTo: parseDayBound(fto, "end") ?? null,
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
        // The name query is applied in ProjectFileTree, including on the first render.
        return filterPartidaGroups(enrichedSegments, enrichedUngrouped, {
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

  // Partidas in the workspace's bloque before any filter: tells "this bloque has
  // none yet" apart from "nothing matches". `block` itself counts as a filter in
  // filterPartidaGroups, so hasFilters cannot.
  const scopeTotal = blockParam === UNGROUPED_FILTER
    ? project.partidas.length
    : project.segments.find((s) => s.id === blockParam)?.partidas.length ?? 0;
  const visiblePartidaIds = inBloqueView
    ? [
      ...filteredPartidas.segments.flatMap((s) => s.partidas.map((p) => p.id)),
      ...filteredPartidas.ungrouped.map((p) => p.id),
    ]
    : [];
  const [lastActivity, recordCounts] = inBloqueView && visiblePartidaIds.length
    ? await Promise.all([
        lastActivityByPartidaIds(visiblePartidaIds),
        prisma.registro.groupBy({ by: ["partidaId"], where: { partidaId: { in: visiblePartidaIds } }, _count: { _all: true } })
          .then((rows) => new Map(rows.map((r) => [r.partidaId, r._count._all]))),
      ])
    : [new Map<string, string>(), new Map<string, number>()];
  const toTreeRow = (p: { id: string; name: string; progressPct: number; segmentId?: string | null; completedAt: Date | null; tags: { tag: { name: string } }[] }) => ({
    id: p.id,
    name: p.name,
    progressPct: p.progressPct,
    segmentId: p.segmentId,
    completedAt: p.completedAt ? p.completedAt.toISOString() : null,
    tags: p.tags,
    lastActivityAt: lastActivity.get(p.id) ?? null,
    recordCount: recordCounts.get(p.id) ?? 0,
  });
  const treeSegments = filteredPartidas.segments.map((s) => {
    const source = project.segments.find((g) => g.id === s.id);
    return {
      id: s.id,
      name: s.name,
      closedAt: source?.closedAt ? source.closedAt.toISOString() : null,
      partidas: s.partidas.map(toTreeRow),
    };
  });
  const treeUngrouped = filteredPartidas.ungrouped.map(toTreeRow);
  const loadedPreview = inBloqueView && selectedId ? await getPartidaPreview(sessionUser, selectedId) : null;
  const initialPreview = loadedPreview && loadedPreview.projectId === id ? loadedPreview : null;

  const tagCounts = new Map<string, number>();
  if (inBloqueView) {
    for (const p of [...project.segments.flatMap((s) => s.partidas), ...project.partidas]) {
      for (const tp of p.tags) tagCounts.set(tp.tag.name, (tagCounts.get(tp.tag.name) ?? 0) + 1);
    }
  }
  // hasActive = facet filters are active (excludes q and block which have their own clear mechanism)
  const hasActiveFacets = tagsParam.length > 0 || partidaFilters.progressMin != null || partidaFilters.progressMax != null || partidaFilters.openCambios || !!ffrom || !!fto;

  const blockChangeRows = inBloqueView && selectedSpace === "solicitudes" && selectedSpaceBlock
    ? (await prisma.changeRequest.findMany({
        where: { projectId: id, segments: { some: { segmentId: selectedSpaceBlock } } },
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { partidas: true, segments: true } } },
      })).map((c) => ({
        id: c.id, code: c.code, title: c.title, status: c.status,
        kind: c.kind, severity: c.severity,
        createdAt: c.createdAt, seal: c.seal,
        segmentCount: c._count.segments || c._count.partidas,
      }))
    : [];

  const spaceDocs = inBloqueView && selectedSpaceBlock && spaceKind[selectedSpace]
    ? await prisma.document.findMany({
        where: {
          projectId: id,
          segmentId: selectedSpaceBlock,
          // Every remaining kind-backed space maps 1:1 to a single DocumentKind
          // ("Ideas" → IDEA). The PLANO/PLANO_ACTUALIZADO revision pairing this
          // used to special-case moved to the project-level Planos tab when the
          // block-scoped Planos space was retired.
          kind: spaceKind[selectedSpace],
        },
        orderBy: { createdAt: "desc" },
      })
    : [];
  const spaceNotes = inBloqueView && selectedSpaceBlock && selectedSpace === "cuaderno"
    ? (await prisma.registro.findMany({
        where: { partida: { projectId: id, segmentId: selectedSpaceBlock, deletedAt: null } },
        orderBy: [{ serverCreatedAt: "desc" }, { id: "desc" }],
        take: 20,
        select: { id: true, partidaId: true, text: true, serverCreatedAt: true, hash: true, partida: { select: { name: true } } },
      })).map((r) => ({ id: r.id, partidaId: r.partidaId, text: r.text, serverCreatedAt: r.serverCreatedAt, hash: r.hash, partidaName: r.partida.name }))
    : [];
  const spaceMedia = inBloqueView && selectedSpaceBlock && selectedSpace === "media"
    ? (await prisma.attachment.findMany({
        where: { registro: { partida: { projectId: id, segmentId: selectedSpaceBlock, deletedAt: null } } },
        orderBy: { id: "desc" },
        take: 60,
        select: { id: true, url: true, fileType: true, registro: { select: { text: true, serverCreatedAt: true } } },
      })).map((a) => ({ id: a.id, url: a.url, fileType: a.fileType, text: a.registro.text, createdAt: a.registro.serverCreatedAt }))
    : [];
  // Resolving a reminder used to make it disappear from every surface at once
  // (it leaves both the pending queue and this space), so there was no way to
  // confirm what had been dealt with. `?rem=resolved` is the history view of
  // the same list.
  const showResolvedReminders = String(rem ?? "") === "resolved";
  const reminderRows = inBloqueView && selectedSpaceBlock
    ? await prisma.registro.findMany({
        where: {
          partida: { projectId: id, segmentId: selectedSpaceBlock, deletedAt: null },
          reminderDueAt: { not: null },
          reminderResolvedAt: showResolvedReminders ? { not: null } : null,
        },
        // Open reminders are a queue (soonest due first); resolved ones are a
        // log (most recently resolved first).
        orderBy: showResolvedReminders ? { reminderResolvedAt: "desc" } : { reminderDueAt: "asc" },
        take: 20,
        select: { id: true, partidaId: true, text: true, serverCreatedAt: true, hash: true, reminderResolvedAt: true, partida: { select: { name: true } } },
      })
    : [];
  const spaceReminders = reminderRows.map((r) => ({ id: r.id, partidaId: r.partidaId, text: r.text, serverCreatedAt: r.serverCreatedAt, hash: r.hash, resolvedAt: r.reminderResolvedAt, partidaName: r.partida.name }));
  // Shared by the panel's block/space links and the reminders open/resolved
  // toggle, so switching reminder views never drops the selected partida or the
  // active filters (the same invariant space-links.ts exists to protect).
  const remindersPreserved = {
    p: selectedId, q: partidaFilters.q, tags: tagsParam,
    pmin: pmin ?? null, pmax: pmax ?? null, cambios: cambios ?? null,
    ffrom: ffrom ?? null, fto: fto ?? null,
  };
  // Overview data — only computed when NOT in the bloque workspace view.
  const searchResults = !inBloqueView && partidaFilters.q
    ? await searchProject(sessionUser, id, partidaFilters.q)
    : null;

  // Deletable = empty by the same rule the action enforces.
  const segmentIdsAll = project.segments.map((s) => s.id);
  const [partidaCounts, docCounts, crCounts] = !inBloqueView && segmentIdsAll.length
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
  if (!inBloqueView) {
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
      date: formatDate(a.registro.serverCreatedAt, lang),
      kind: mediaTab === "fotos" ? "image" : mediaTab === "videos" ? "video" : mediaTab === "audio" ? "audio" : "pdf",
    }));
    if (mediaTab === "documentos" && mediaPage === 1) {
      // Uploaded documents (planos, minutas, etc.) join the PDF attachments on page 1.
      const docs2 = await prisma.document.findMany({
        where: { projectId: id },
        orderBy: { createdAt: "desc" },
        take: MEDIA_PAGE,
        select: { id: true, url: true, title: true, fileName: true, kind: true, createdAt: true, thumbKey: true },
      });
      mediaItems = [
        ...docs2.map((d) => ({
          id: d.id, url: d.url,
          label: d.title ?? d.fileName ?? d.kind,
          date: formatDate(d.createdAt, lang),
          kind: "doc" as const,
          thumbUrl: d.thumbKey ? `/api/media/${d.thumbKey}` : undefined,
        })),
        ...mediaItems,
      ].slice(0, MEDIA_PAGE * 2);
    }
  }

  const deletedPartidas = inBloqueView && isOwner
    ? await prisma.partida.findMany({
        where: { projectId: id, deletedAt: { not: null } },
        include: { _count: { select: { registros: true } } },
        orderBy: { deletedAt: "desc" },
      })
    : [];
  const deleterIds = [...new Set(deletedPartidas.map((p) => p.deletedById).filter((x): x is string => !!x))];
  const deleters = deleterIds.length
    ? await prisma.user.findMany({ where: { id: { in: deleterIds }, companyId: sessionUser.companyId }, select: { id: true, name: true } })
    : [];
  const deleterMap = new Map(deleters.map((u) => [u.id, u.name]));

  return inBloqueView ? (
    <>
      <PartidaWorkspace
        projectId={project.id}
        segments={treeSegments}
        ungrouped={treeUngrouped}
        segmentOptions={segmentOptions}
        selectedId={initialPreview ? selectedId : undefined}
        initialPreview={initialPreview}
        canEdit={canEditStructure}
        filters={{ ...partidaFilters, total: filteredPartidas.total, hasFilters: filteredPartidas.hasFilters, scopeTotal }}
        facets={{
          tagCounts: [...tagCounts.entries()],
          selected: { tags: partidaFilters.tags, progressMin: partidaFilters.progressMin, progressMax: partidaFilters.progressMax, openCambios: partidaFilters.openCambios, createdFrom: String(ffrom ?? ""), createdTo: String(fto ?? "") },
          hasActive: hasActiveFacets,
        }}
        activeBlock={activeSegment ? { id: activeSegment.id, name: activeSegment.name, closedAt: activeSegment.closedAt } : null}
        lang={lang}
        treeT={{
          ungrouped: P.ungrouped, newPartida: P.newPartida, add: P.add,
          segmentPlaceholder: P.segmentPlaceholder, newSegment: P.newSegment,
          addSegment: P.addSegment, rename: P.rename, save: P.save,
          move: P.move, moveTo: P.moveTo, searchPartidas: P.searchPartidas,
          allBlocks: P.allBlocks, filter: P.filter, clear: P.clear,
          noResults: P.noResults, empty: P.empty,
          recordsOne: P.recordsOne, recordsMany: P.recordsMany,
          statusNotStarted: P.analitica.notStarted, statusInProgress: P.analitica.inProgress,
          newPartidaButton: P.newPartidaButton, close: P.panelClose,
          facetTags: P.facetTags, facetProgress: P.facetProgress,
          facetProgressMin: P.facetProgressMin, facetProgressMax: P.facetProgressMax,
          facetOpenCambios: P.facetOpenCambios, facetCreated: P.facetCreated,
          blockClosedNoCreate: t.lifecycle.blockClosedNoCreate,
          concluded: t.lifecycle.concluded, aging7: P.aging7, aging14: P.aging14, noActivity: P.noActivity,
        }}
        panelT={{
          empty: P.summaryEmpty, noEntries: P.summaryNoEntries,
          newRegistro: P.newRegistro, openCuaderno: P.openCuaderno, editPartida: P.editPartida,
          panelOffline: P.panelOffline, panelClose: P.panelClose,
          progress: t.partida.progress, save: P.save,
          conclude: t.lifecycle.concludePartida, reopen: t.lifecycle.reopenPartida,
          concluded: t.lifecycle.concluded, concludedOn: t.lifecycle.concludedOn,
          rename: P.rename, move: P.move, moveTo: P.moveTo, ungrouped: P.ungrouped,
          tagsLabel: P.tagsLabel,
        }}
      />
      <BloqueSpacesPanel
        projectId={project.id}
        segments={segmentSummaries}
        selectedSegmentId={selectedSpaceBlock}
        selectedSpace={selectedSpace}
        docs={spaceDocs}
        notes={spaceNotes}
        media={spaceMedia}
        reminders={spaceReminders}
        remindersShowResolved={showResolvedReminders}
        remindersOpenHref={projectHrefWithParams(project.id, {
          ...remindersPreserved, block: blockParam, space: "recordatorios",
        })}
        remindersResolvedHref={projectHrefWithParams(project.id, {
          ...remindersPreserved, block: blockParam, space: "recordatorios", rem: "resolved",
        })}
        requestsContent={selectedSpaceBlock ? (
          <CambiosList
            projectId={project.id}
            rows={blockChangeRows}
            partidas={segmentOptions}
            fixedSegment={{
              id: selectedSpaceBlock,
              name: segmentOptions.find((s) => s.id === selectedSpaceBlock)?.name ?? "",
            }}
            lang={lang}
            t={requestListT}
          />
        ) : null}
        canUpload={canEditStructure}
        canResolve={canEditStructure}
        canManageLifecycle={canEditStructure}
        preserved={remindersPreserved}
        lang={lang}
        t={{
          emptyDocs: t.planos.empty, upload: t.planos.upload, file: t.planos.file, uploadByKind: t.planos.uploadByKind, title: t.planos.title, error: t.planos.error, uploadedBy: t.planos.uploadedBy, view: t.planos.view, resolve: P.resolveReminder,
          blockClosed: t.lifecycle.blockClosed, closeBlock: t.lifecycle.closeBlock, reopenBlock: t.lifecycle.reopenBlock,
          remindersOpen: P.remindersOpen, remindersResolved: P.remindersResolved,
          remindersResolvedEmpty: P.remindersResolvedEmpty, reminderResolvedAt: P.reminderResolvedAt,
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
          newBloque: P.newBloque, add: P.add, close: P.panelClose,
        }}
      />
      <ObraSearch
        projectId={project.id}
        initialQuery={partidaFilters.q}
        initialResults={searchResults}
        t={{
          searchObra: P.searchObra, filter: P.filter, searchLoading: P.searchLoading, searchError: P.searchError,
          searchResults: P.searchResults, searchNoResults: P.searchNoResults, searchInPartidas: P.searchInPartidas,
          searchInRegistros: P.searchInRegistros, searchInDocumentos: P.searchInDocumentos, searchInCambios: P.searchInCambios,
        }}
      />
      <MediaGalleries
        projectId={project.id}
        tab={mediaTab}
        items={mediaItems}
        page={mediaPage}
        hasMore={mediaHasMore}
        t={{ mediaTitle: P.mediaTitle, mediaFotos: P.mediaFotos, mediaVideos: P.mediaVideos, mediaDocumentos: P.mediaDocumentos, mediaAudio: P.mediaAudio, mediaEmpty: P.mediaEmpty, older: t.pager.older, newer: t.pager.newer }}
      />
    </>
  );
}
