"use client";
import { startTransition, useCallback, useEffect, useOptimistic, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { runPanelAction, type PanelAction } from "@/app/actions/partida-panel";
import type { Lang } from "@/i18n/dictionaries";
import type { PartidaPreview } from "@/lib/partida/preview";
import { PartidaPanelView, type PanelCopy, type PartidaPanelShell } from "@/components/partida-panel";
import { ProjectFileTree, type PartidaTreeRow } from "@/components/project-file-tree";

type SegmentGroup = { id: string; name: string; closedAt: string | null; partidas: PartidaTreeRow[] };

type TreeT = Parameters<typeof ProjectFileTree>[0]["t"];
type TreeFilters = Parameters<typeof ProjectFileTree>[0]["filters"];
type TreeFacets = Parameters<typeof ProjectFileTree>[0]["facets"];
type ActiveBlock = Parameters<typeof ProjectFileTree>[0]["activeBlock"];

type RowPatch = Partial<Pick<PartidaTreeRow, "name" | "progressPct" | "completedAt" | "segmentId" | "tags">>;

type Rows = { segments: SegmentGroup[]; ungrouped: PartidaTreeRow[] };

function patchGroups(rows: Rows, id: string, patch: RowPatch): Rows {
  const apply = (row: PartidaTreeRow): PartidaTreeRow => row.id === id ? { ...row, ...patch } : row;
  return {
    segments: rows.segments.map((s) => ({ ...s, partidas: s.partidas.map(apply) })),
    ungrouped: rows.ungrouped.map(apply),
  };
}

function rowPatchFrom(data: PartidaPreview): RowPatch {
  return {
    name: data.name,
    progressPct: data.progressPct,
    completedAt: data.completedAt,
    tags: data.tags.map((name) => ({ tag: { name } })),
    segmentId: data.segment?.id ?? null,
  };
}

function findShell(segments: SegmentGroup[], ungrouped: PartidaTreeRow[], id: string | undefined): PartidaPanelShell | null {
  if (!id) return null;
  for (const s of segments) {
    const row = s.partidas.find((p) => p.id === id);
    if (row) {
      return {
        id: row.id,
        name: row.name,
        progressPct: row.progressPct,
        completedAt: row.completedAt ?? null,
        tags: (row.tags ?? []).map((x) => x.tag.name),
        segmentName: s.name,
        segmentClosedAt: s.closedAt,
      };
    }
  }
  const row = ungrouped.find((p) => p.id === id);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    progressPct: row.progressPct,
    completedAt: row.completedAt ?? null,
    tags: (row.tags ?? []).map((x) => x.tag.name),
    segmentName: null,
    segmentClosedAt: null,
  };
}

const PHONE_SHEET = "(max-width: 899px)";

function revealRowAboveSheet(row: HTMLElement) {
  if (!window.matchMedia(PHONE_SHEET).matches) return;
  const panel = document.querySelector(".workspace-panel.is-open");
  const sheetTop = panel instanceof HTMLElement
    ? panel.getBoundingClientRect().top
    : window.innerHeight * 0.45;
  const rect = row.getBoundingClientRect();
  const overflow = rect.bottom - sheetTop + 8;
  if (overflow <= 0 && rect.top >= 0) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollBy({
    top: overflow > 0 ? overflow : rect.top,
    behavior: reduce ? "auto" : "smooth",
  });
}

export function PartidaWorkspace({
  projectId,
  segments: initialSegments,
  ungrouped: initialUngrouped,
  segmentOptions,
  selectedId: initialSelectedId,
  initialPreview,
  canEdit,
  filters,
  facets,
  activeBlock,
  lang,
  treeT,
  panelT,
}: {
  projectId: string;
  segments: SegmentGroup[];
  ungrouped: PartidaTreeRow[];
  segmentOptions: { id: string; name: string }[];
  selectedId?: string;
  initialPreview: PartidaPreview | null;
  canEdit: boolean;
  filters: TreeFilters;
  facets: TreeFacets;
  activeBlock: ActiveBlock;
  lang: Lang;
  treeT: TreeT;
  panelT: PanelCopy;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  const [rows, setRows] = useState<Rows>({ segments: initialSegments, ungrouped: initialUngrouped });
  const [preview, setPreview] = useState<PartidaPreview | null>(
    initialPreview && initialPreview.id === initialSelectedId ? initialPreview : null,
  );
  const [offline, setOffline] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const openedByPush = useRef(false);
  const skipFirstFetch = useRef(Boolean(initialPreview && initialPreview.id === initialSelectedId));
  const headingEl = useRef<HTMLHeadingElement | null>(null);
  const rowEls = useRef(new Map<string, HTMLButtonElement>());
  const prevSelected = useRef(initialSelectedId);

  useEffect(() => {
    setRows({ segments: initialSegments, ungrouped: initialUngrouped });
  }, [initialSegments, initialUngrouped]);

  // Both optimistic layers live only while a save's transition is pending, so
  // a failed save puts the panel AND the list row back on their own.
  const [optPreview, applyPreview] = useOptimistic(preview, (current, patch: Partial<PartidaPreview>) => (
    current ? { ...current, ...patch } : current
  ));
  const [optRows, applyOptRow] = useOptimistic(rows, (current, change: { id: string; patch: RowPatch }) => (
    patchGroups(current, change.id, change.patch)
  ));

  // Functional, so a response that lands late patches the rows as they are
  // now, never a snapshot from when the request started.
  const applyRowPatch = useCallback((id: string, patch: RowPatch) => {
    setRows((current) => patchGroups(current, id, patch));
  }, []);

  // Native history is patched by Next 15.5 onto ACTION_RESTORE (no RSC fetch).
  // Pass null, not history.state: a __NA payload skips the patch.
  const writeP = useCallback((id: string | null, mode: "push" | "replace") => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("p", id);
    else url.searchParams.delete("p");
    if (mode === "push") window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  }, []);

  const select = useCallback((id: string) => {
    const had = new URL(window.location.href).searchParams.get("p");
    if (had) writeP(id, "replace");
    else {
      writeP(id, "push");
      openedByPush.current = true;
    }
    setSelectedId(id);
  }, [writeP]);

  const closePanel = useCallback(() => {
    if (openedByPush.current) {
      openedByPush.current = false;
      window.history.back();
      return;
    }
    writeP(null, "replace");
    setSelectedId(undefined);
  }, [writeP]);

  useEffect(() => {
    const onPop = () => {
      openedByPush.current = false;
      const p = new URL(window.location.href).searchParams.get("p") ?? undefined;
      setSelectedId(p);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedId) {
        e.preventDefault();
        closePanel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, closePanel]);

  useEffect(() => {
    const phoneSheet = Boolean(selectedId) && window.matchMedia(PHONE_SHEET).matches;
    document.documentElement.classList.toggle("sheet-open", phoneSheet);
    return () => document.documentElement.classList.remove("sheet-open");
  }, [selectedId]);

  useEffect(() => {
    if (selectedId && selectedId !== prevSelected.current) {
      headingEl.current?.focus({ preventScroll: true });
      const row = rowEls.current.get(selectedId);
      if (row) {
        requestAnimationFrame(() => requestAnimationFrame(() => revealRowAboveSheet(row)));
      }
    }
    if (!selectedId && prevSelected.current) {
      rowEls.current.get(prevSelected.current)?.focus({ preventScroll: true });
    }
    prevSelected.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setPreview(null);
      setOffline(false);
      return;
    }
    if (skipFirstFetch.current && preview?.id === selectedId) {
      skipFirstFetch.current = false;
      return;
    }
    skipFirstFetch.current = false;
    const ac = new AbortController();
    setOffline(false);
    fetch(`/api/partidas/${selectedId}/preview`, { signal: ac.signal, cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("fail");
        return res.json() as Promise<PartidaPreview>;
      })
      .then((data) => {
        setPreview(data);
        applyRowPatch(data.id, rowPatchFrom(data));
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setOffline(true);
      });
    return () => ac.abort();
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps -- fetch only on selection change

  async function refetch(id: string) {
    const res = await fetch(`/api/partidas/${id}/preview`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json() as PartidaPreview;
    setPreview(data);
    applyRowPatch(data.id, rowPatchFrom(data));
  }

  // The whole save is one async transition: the optimistic patches hold until
  // the server answers and the real data is in, then drop away (and revert on
  // failure, since nothing replaced them).
  function run(action: PanelAction, id: string, fields: Record<string, string>, previewPatch: Partial<PartidaPreview>, rowPatch: RowPatch) {
    const fd = new FormData();
    fd.set("partidaId", id);
    for (const [key, value] of Object.entries(fields)) fd.set(key, value);
    setFormError(null);
    setBusy(true);
    startTransition(async () => {
      applyPreview(previewPatch);
      applyOptRow({ id, patch: rowPatch });
      try {
        const result = await runPanelAction(action, fd);
        if (!result.ok) {
          setFormError(result.error);
          return;
        }
        await refetch(id);
        router.refresh();
      } catch {
        // The request itself failed (offline, or the server never answered).
        setFormError(panelT.panelOffline);
      } finally {
        setBusy(false);
      }
    });
  }

  const shell = findShell(optRows.segments, optRows.ungrouped, selectedId);

  return (
    <div className={`workspace${selectedId ? " is-sheet-open" : ""}`}>
      <div className="workspace-list">
        <ProjectFileTree
          projectId={projectId}
          segments={optRows.segments}
          ungrouped={optRows.ungrouped}
          selectedId={selectedId}
          isAdmin={canEdit}
          filters={filters}
          facets={facets}
          activeBlock={activeBlock}
          lang={lang}
          t={treeT}
          onSelect={select}
          rowRef={(id, el) => {
            if (el) rowEls.current.set(id, el);
            else rowEls.current.delete(id);
          }}
        />
      </div>
      <PartidaPanelView
        shell={shell}
        preview={optPreview}
        canEdit={canEdit}
        lang={lang}
        t={panelT}
        open={Boolean(selectedId)}
        headingRef={(el) => { headingEl.current = el; }}
        formError={formError}
        busy={busy}
        offline={offline}
        segments={segmentOptions}
        onClose={closePanel}
        onProgress={(id, progressPct) => run("progress", id, { progressPct: String(progressPct) }, { progressPct }, { progressPct })}
        onConclude={(id) => {
          const completedAt = new Date().toISOString();
          run("conclude", id, {}, { completedAt, progressPct: 100 }, { completedAt, progressPct: 100 });
        }}
        onReopen={(id) => run("reopen", id, {}, { completedAt: null }, { completedAt: null })}
        onRename={(id, name) => run("rename", id, { name }, { name }, { name })}
        onMove={(id, segmentId) => run("move", id, { segmentId }, {}, { segmentId: segmentId || null })}
        onTags={(id, tags) => {
          const names = tags.split(",").map((x) => x.trim()).filter(Boolean);
          run("tags", id, { tags }, { tags: names }, { tags: names.map((name) => ({ tag: { name } })) });
        }}
      />
    </div>
  );
}
