"use client";
import { startTransition, useCallback, useEffect, useOptimistic, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { concludePartida, reopenPartida } from "@/app/actions/lifecycle";
import { updatePartidaProgress } from "@/app/actions/partida-progress";
import { movePartida, renamePartida } from "@/app/actions/project-edit";
import { setPartidaTags } from "@/app/actions/partida-tags";
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

function patchGroups(groups: SegmentGroup[], ungrouped: PartidaTreeRow[], id: string, patch: RowPatch): { segments: SegmentGroup[]; ungrouped: PartidaTreeRow[] } {
  const apply = (row: PartidaTreeRow): PartidaTreeRow => row.id === id ? { ...row, ...patch } : row;
  return {
    segments: groups.map((s) => ({ ...s, partidas: s.partidas.map(apply) })),
    ungrouped: ungrouped.map(apply),
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

function actionError(e: unknown, fallback: string) {
  return e instanceof Error && e.message ? e.message : fallback;
}

const PHONE_SHEET = "(max-width: 899px)";

function revealRowAboveSheet(row: HTMLElement) {
  if (!window.matchMedia(PHONE_SHEET).matches) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  row.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reduce ? "auto" : "smooth" });
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
  const [segments, setSegments] = useState(initialSegments);
  const [ungrouped, setUngrouped] = useState(initialUngrouped);
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
    setSegments(initialSegments);
    setUngrouped(initialUngrouped);
  }, [initialSegments, initialUngrouped]);

  const [optPreview, applyPreview] = useOptimistic(preview, (current, patch: Partial<PartidaPreview>) => (
    current ? { ...current, ...patch } : current
  ));

  const applyRowPatch = useCallback((id: string, patch: RowPatch) => {
    const next = patchGroups(segments, ungrouped, id, patch);
    setSegments(next.segments);
    setUngrouped(next.ungrouped);
  }, [segments, ungrouped]);

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
        requestAnimationFrame(() => revealRowAboveSheet(row));
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
        applyRowPatch(data.id, {
          name: data.name,
          progressPct: data.progressPct,
          completedAt: data.completedAt,
          tags: data.tags.map((name) => ({ tag: { name } })),
          segmentId: data.segment?.id ?? null,
        });
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
    applyRowPatch(data.id, {
      name: data.name,
      progressPct: data.progressPct,
      completedAt: data.completedAt,
      tags: data.tags.map((name) => ({ tag: { name } })),
      segmentId: data.segment?.id ?? null,
    });
  }

  async function run(id: string, previewPatch: Partial<PartidaPreview>, rowPatch: RowPatch, fn: () => Promise<void>) {
    setFormError(null);
    setBusy(true);
    startTransition(() => {
      applyPreview(previewPatch);
      applyRowPatch(id, rowPatch);
    });
    try {
      await fn();
      await refetch(id);
      router.refresh();
    } catch (e) {
      setFormError(actionError(e, panelT.panelOffline));
    } finally {
      setBusy(false);
    }
  }

  const shell = findShell(segments, ungrouped, selectedId);

  return (
    <div className={`workspace${selectedId ? " is-sheet-open" : ""}`}>
      <div className="workspace-list">
        <ProjectFileTree
          projectId={projectId}
          segments={segments}
          ungrouped={ungrouped}
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
        onProgress={(id, progressPct) => {
          const fd = new FormData();
          fd.set("partidaId", id);
          fd.set("progressPct", String(progressPct));
          void run(id, { progressPct }, { progressPct }, () => updatePartidaProgress(fd));
        }}
        onConclude={(id) => {
          const fd = new FormData();
          fd.set("partidaId", id);
          void run(id, { completedAt: new Date().toISOString(), progressPct: 100 }, { completedAt: new Date().toISOString(), progressPct: 100 }, () => concludePartida(fd));
        }}
        onReopen={(id) => {
          const fd = new FormData();
          fd.set("partidaId", id);
          void run(id, { completedAt: null }, { completedAt: null }, () => reopenPartida(fd));
        }}
        onRename={(id, name) => {
          const fd = new FormData();
          fd.set("partidaId", id);
          fd.set("name", name);
          void run(id, { name }, { name }, () => renamePartida(fd));
        }}
        onMove={(id, segmentId) => {
          const fd = new FormData();
          fd.set("partidaId", id);
          fd.set("segmentId", segmentId);
          void run(id, {}, { segmentId: segmentId || null }, () => movePartida(fd));
        }}
        onTags={(id, tags) => {
          const fd = new FormData();
          fd.set("partidaId", id);
          fd.set("tags", tags);
          const names = tags.split(",").map((x) => x.trim()).filter(Boolean);
          void run(id, { tags: names }, { tags: names.map((name) => ({ tag: { name } })) }, () => setPartidaTags(fd));
        }}
      />
    </div>
  );
}
