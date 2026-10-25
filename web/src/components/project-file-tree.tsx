"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPartida } from "@/app/actions/admin";
import { SubmitButton } from "@/components/submit-button";
import { RenameSegmentForm } from "@/components/project-edit-controls";
import { BloqueLabel } from "@/components/bloque-label";
import { PartidaFilterBar, type PartidaFacets } from "@/components/partida-filter-bar";
import { PartidaCardGrid } from "@/components/partida-card-grid";
import { applyPartidaNameFilter, shouldAdoptUrlQuery } from "@/lib/project/partida-filter";
import { partidaCardModel } from "@/lib/partida/card-model";
import type { Lang } from "@/i18n/dictionaries";

export type PartidaTreeRow = {
  id: string;
  name: string;
  progressPct: number;
  segmentId?: string | null;
  completedAt?: string | null;
  tags?: { tag: { name: string } }[];
  lastActivityAt?: string | null;
  recordCount?: number;
};

type TreeT = {
  ungrouped: string; newPartida: string; add: string;
  segmentPlaceholder: string; newSegment: string; addSegment: string;
  rename: string; save: string; move: string; moveTo: string;
  searchPartidas: string; allBlocks: string; filter: string; clear: string; noResults: string; empty: string;
  facetTags: string; facetProgress: string; facetProgressMin: string; facetProgressMax: string;
  facetOpenCambios: string; facetCreated: string;
  blockClosedNoCreate: string;
  concluded: string; aging7: string; aging14: string; noActivity: string;
  recordsOne: string; recordsMany: string; statusNotStarted: string; statusInProgress: string;
};

type ActiveBlock = { id: string; name: string; closedAt: Date | string | null } | null;

type FilterState = { q: string; block: string; tags: string[]; progressMin: number | null; progressMax: number | null; openCambios: boolean; createdFrom: Date | null; createdTo: Date | null; total: number; hasFilters: boolean;
  /** Partidas in the bloque before any filter, so an empty grid can say which empty it is. */
  scopeTotal: number;
};

/**
 * The bloque workspace's list side: search bar, then the partidas as cards.
 * Owns the name query so typing filters the cards at once, while `q` follows
 * into the URL (replaceState, no navigation) for sharing and reloads.
 */
export function ProjectFileTree({
  projectId, segments, ungrouped, selectedId, isAdmin, filters, facets, activeBlock, lang, t, onSelect, rowRef,
}: {
  projectId: string;
  segments: { id: string; name: string; partidas: PartidaTreeRow[] }[];
  ungrouped: PartidaTreeRow[];
  selectedId?: string;
  isAdmin: boolean;
  filters: FilterState;
  facets: PartidaFacets;
  activeBlock: ActiveBlock;
  lang: Lang;
  t: TreeT;
  onSelect: (id: string) => void;
  rowRef: (id: string, el: HTMLButtonElement | null) => void;
}) {
  const [q, setQ] = useState(filters.q);
  // The last q this box wrote to the URL. A refresh echoes it (or an older one)
  // back as filters.q; neither may overwrite what is being typed.
  const lastWritten = useRef(filters.q);
  useEffect(() => {
    const inUrl = new URL(window.location.href).searchParams.get("q") ?? "";
    if (!shouldAdoptUrlQuery(filters.q, lastWritten.current, inUrl)) return;
    lastWritten.current = filters.q;
    setQ(filters.q);
  }, [filters.q]);

  const named = useMemo(
    () => applyPartidaNameFilter(segments, ungrouped, q, filters.hasFilters),
    [segments, ungrouped, q, filters.hasFilters],
  );

  useEffect(() => {
    const id = window.setTimeout(() => {
      const url = new URL(window.location.href);
      const current = url.searchParams.get("q") ?? "";
      const next = q.trim();
      lastWritten.current = next;
      if (next === current) return;
      if (next) url.searchParams.set("q", next);
      else url.searchParams.delete("q");
      window.history.replaceState(null, "", url);
    }, 250);
    return () => window.clearTimeout(id);
  }, [q]);

  const now = new Date();
  const toCard = (row: PartidaTreeRow, blockName: string) => partidaCardModel(row, {
    lang, now, blockName,
    recordCount: row.recordCount ?? 0,
    lastActivityAt: row.lastActivityAt ? new Date(row.lastActivityAt) : null,
  });
  const cards = [
    ...named.segments.flatMap((s) => s.partidas.map((row) => toCard(row, s.name))),
    ...named.ungrouped.map((row) => toCard(row, t.ungrouped)),
  ];

  return (
    <div className="tree">
      <PartidaFilterBar
        projectId={projectId}
        block={filters.block}
        q={q}
        onQueryChange={setQ}
        // Clear the box here too: when the page loaded with no q, the
        // navigation leaves filters.q unchanged, so the sync effect never
        // runs and the typed name would keep filtering the cards.
        onClear={() => { lastWritten.current = ""; setQ(""); }}
        hasFilters={named.hasFilters}
        facets={facets}
        t={t}
      />
      {activeBlock && (
        <div className="partida-grid-head">
          <BloqueLabel name={activeBlock.name} />
          {isAdmin && <RenameSegmentForm segmentId={activeBlock.id} currentName={activeBlock.name} t={t} />}
        </div>
      )}
      <PartidaCardGrid
        cards={cards}
        selectedId={selectedId}
        onSelect={onSelect}
        emptyLabel={filters.scopeTotal === 0 ? t.empty : t.noResults}
        cardRef={rowRef}
        t={{
          recordsOne: t.recordsOne, recordsMany: t.recordsMany, noActivity: t.noActivity,
          statusNotStarted: t.statusNotStarted, statusInProgress: t.statusInProgress, statusConcluded: t.concluded,
          aging7: t.aging7, aging14: t.aging14,
        }}
      />
      {isAdmin && (
        <div className="tree-actions">
          {activeBlock?.closedAt ? (
            <p className="text-steel" style={{ fontSize: "0.8rem" }}>{t.blockClosedNoCreate}</p>
          ) : (
            // WS4C: creation always targets the active block implicitly — no
            // free-typed segment name and no "create another block" control
            // here (block creation stays at the project overview level, via
            // BloqueCards' own add-bloque form).
            <form action={createPartida} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <input type="hidden" name="projectId" value={projectId} />
              {activeBlock && <input type="hidden" name="segment" value={activeBlock.name} />}
              <input name="name" placeholder={t.newPartida} required className="input" />
              <SubmitButton className="btn btn-accent" style={{ padding: "0.5rem 0.85rem", fontSize: "0.82rem" }}>{t.add}</SubmitButton>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
