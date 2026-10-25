"use client";
import { startTransition, useCallback, useEffect, useOptimistic, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { concludePartidaForm, reopenPartidaForm } from "@/app/actions/lifecycle";
import { updatePartidaProgressForm } from "@/app/actions/partida-progress";
import { movePartidaForm, renamePartidaForm } from "@/app/actions/project-edit";
import { setPartidaTagsForm } from "@/app/actions/partida-tags";
import type { FormError } from "@/lib/errors/form-result";
import type { Lang } from "@/i18n/dictionaries";
import type { PartidaPreview } from "@/lib/partida/preview";
import { PartidaPanelView, type PanelCopy, type PartidaPanelShell } from "@/components/partida-panel";
import { ProjectFileTree, type PartidaTreeRow } from "@/components/project-file-tree";
import { Sheet } from "@/components/sheet";

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

type PanelAction = "progress" | "conclude" | "reopen" | "rename" | "move" | "tags";

const PANEL_ACTIONS: Record<PanelAction, (prev: FormError | null, formData: FormData) => Promise<FormError | null>> = {
  progress: updatePartidaProgressForm,
  conclude: concludePartidaForm,
  reopen: reopenPartidaForm,
  rename: renamePartidaForm,
  move: movePartidaForm,
  tags: setPartidaTagsForm,
};

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
  const skipFirstFetch = useRef(Boolean(initialPreview && initialPreview.id === initialSelectedId));

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

  // `?p=` names the open partida, always written with replaceState: the sheet
  // owns the one history entry (lib/ui/sheet-history.ts), so Back closes it.
  // This runs after the sheet's own effect (child effects first), so `p` lands
  // on the sheet's entry and the entry underneath never carries it: popping
  // back, by gesture or by Escape, lands on the workspace without `p`.
  // State is { sheet: true } on the sheet's entry, else null: no __NA, so
  // Next 15.5's patched replaceState copies its internals in and syncs the
  // router's URL, while the flag the sheet checks before popping survives.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (selectedId) url.searchParams.set("p", selectedId);
    else url.searchParams.delete("p");
    if (url.href === window.location.href) return;
    const onSheetEntry = (window.history.state as { sheet?: boolean } | null)?.sheet === true;
    window.history.replaceState(onSheetEntry ? { sheet: true } : null, "", url);
  }, [selectedId]);

  const select = useCallback((id: string) => setSelectedId(id), []);
  const closePanel = useCallback(() => setSelectedId(undefined), []);

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
        // The *Form wrappers return the viewer's sentence (UserError key) instead
        // of throwing: Next masks thrown action messages in production.
        const result = await PANEL_ACTIONS[action](null, fd);
        if (result?.error) {
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
    <div className="workspace">
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
        />
      </div>
      <Sheet
        open={Boolean(shell)}
        title={optPreview?.name ?? shell?.name ?? ""}
        onClose={closePanel}
        closeLabel={panelT.panelClose}
      >
        {shell && (
          <PartidaPanelView
            shell={shell}
            preview={optPreview}
            canEdit={canEdit}
            lang={lang}
            t={panelT}
            formError={formError}
            busy={busy}
            offline={offline}
            segments={segmentOptions}
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
        )}
      </Sheet>
    </div>
  );
}
