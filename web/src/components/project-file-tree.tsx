"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createPartida } from "@/app/actions/admin";
import { SubmitButton } from "@/components/submit-button";
import { Folder, Search } from "@/components/icons";
import { RenameSegmentForm } from "@/components/project-edit-controls";
import { applyPartidaNameFilter } from "@/lib/project/partida-filter";
import { projectProgress } from "@/lib/project/progress";
import { formatTimestamp } from "@/lib/format/datetime";
import { activityAging } from "@/lib/partida/aging";
import type { Lang } from "@/i18n/dictionaries";

export type PartidaTreeRow = {
  id: string;
  name: string;
  progressPct: number;
  segmentId?: string | null;
  completedAt?: string | null;
  tags?: { tag: { name: string } }[];
  lastActivityAt?: string | null;
};

type TreeT = {
  ungrouped: string; newPartida: string; add: string;
  segmentPlaceholder: string; newSegment: string; addSegment: string;
  rename: string; save: string; move: string; moveTo: string;
  searchPartidas: string; allBlocks: string; filter: string; clear: string; noResults: string;
  facetTags: string; facetProgress: string; facetProgressMin: string; facetProgressMax: string;
  facetOpenCambios: string; facetCreated: string;
  blockClosedNoCreate: string;
  concluded: string; aging7: string; aging14: string; noActivity: string;
};

type ActiveBlock = { id: string; name: string; closedAt: Date | string | null } | null;

type FacetsState = {
  tagCounts: [string, number][];
  selected: { tags: string[]; progressMin: number | null; progressMax: number | null; openCambios: boolean; createdFrom: string; createdTo: string };
  hasActive: boolean;
};

type FilterState = { q: string; block: string; tags: string[]; progressMin: number | null; progressMax: number | null; openCambios: boolean; createdFrom: Date | null; createdTo: Date | null; total: number; hasFilters: boolean };

function FileRow({
  pa, selectedId, lang, t, onSelect, rowRef,
}: {
  pa: PartidaTreeRow;
  selectedId?: string;
  lang: Lang;
  t: TreeT;
  onSelect: (id: string) => void;
  rowRef: (id: string, el: HTMLButtonElement | null) => void;
}) {
  const selected = pa.id === selectedId;
  const aging = activityAging(pa.lastActivityAt);
  const concluded = Boolean(pa.completedAt);
  const rowClass = [
    "tree-row",
    selected ? "is-active" : "",
    aging === "14" ? "is-aging-14" : "",
  ].filter(Boolean).join(" ");
  return (
    <div className={rowClass}>
      <button
        type="button"
        className="tree-file"
        aria-pressed={selected}
        aria-label={`${pa.name} — ${pa.progressPct}%`}
        title={pa.name}
        onClick={() => onSelect(pa.id)}
        ref={(el) => rowRef(pa.id, el)}
      >
        <span className="tree-file-name">{pa.name}</span>
        <span className="pct">{pa.progressPct}%</span>
      </button>
      <div className="tree-row-meta">
        {concluded && <span className="state-badge is-concluded">{t.concluded}</span>}
        {pa.tags && pa.tags.length > 0 && pa.tags.map((x) => (
          <span key={x.tag.name} className="chip">{x.tag.name}</span>
        ))}
        <span className={`tree-activity${aging === "7" ? " is-aging-7" : ""}`}>
          {pa.lastActivityAt
            ? formatTimestamp(new Date(pa.lastActivityAt), lang)
            : t.noActivity}
        </span>
        {aging && (
          <span className={`aging-mark is-${aging}`}>{aging === "14" ? t.aging14 : t.aging7}</span>
        )}
      </div>
      <span className="tree-row-track" aria-hidden="true" />
      <span
        className={`tree-row-band${concluded ? " is-done" : ""}`}
        style={{ width: `${Math.min(Math.max(pa.progressPct, 0), 100)}%` }}
        aria-hidden="true"
      />
    </div>
  );
}

export function ProjectFileTree({
  projectId, segments, ungrouped, selectedId, isAdmin, filters, facets, activeBlock, lang, t, onSelect, rowRef,
}: {
  projectId: string;
  segments: { id: string; name: string; partidas: PartidaTreeRow[] }[];
  ungrouped: PartidaTreeRow[];
  selectedId?: string;
  isAdmin: boolean;
  filters: FilterState;
  facets: FacetsState;
  activeBlock: ActiveBlock;
  lang: Lang;
  t: TreeT;
  onSelect: (id: string) => void;
  rowRef: (id: string, el: HTMLButtonElement | null) => void;
}) {
  const [q, setQ] = useState(filters.q);
  // A facet navigation delivers a new URL query. Typing does not: the prop stays put.
  useEffect(() => { setQ(filters.q); }, [filters.q]);

  const named = useMemo(
    () => applyPartidaNameFilter(segments, ungrouped, q, filters.hasFilters),
    [segments, ungrouped, q, filters.hasFilters],
  );

  useEffect(() => {
    const id = window.setTimeout(() => {
      const url = new URL(window.location.href);
      const current = url.searchParams.get("q") ?? "";
      const next = q.trim();
      if (next === current) return;
      if (next) url.searchParams.set("q", next);
      else url.searchParams.delete("q");
      window.history.replaceState(null, "", url);
    }, 250);
    return () => window.clearTimeout(id);
  }, [q]);

  return (
    <div className="tree">
      <form action={`/app/projects/${projectId}`} className="tree-filter">
        <input type="hidden" name="tab" value="code" />
        <label className="search-wrap" style={{ marginBottom: 0 }}>
          <span className="icon"><Search size={13} /></span>
          <input
            name="q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.searchPartidas}
            className="search-input"
          />
        </label>
        {/* WS4F: the active block is fixed by the workspace context (Bloques
            overview / space nav switch it), not by a second selector nested
            inside this filter form — a hidden field just preserves it across
            facet-only submissions. */}
        <input type="hidden" name="block" value={filters.block} />
        <details className="facet-panel" open={facets.hasActive}>
          <summary className="form-label" style={{ cursor: "pointer" }}>{t.filter}</summary>
          <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
            {facets.tagCounts.length > 0 && (
              <div>
                <div className="form-label">{t.facetTags}</div>
                {facets.tagCounts.map(([name, count]) => (
                  <label key={name} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: "0.8rem" }}>
                    <input type="checkbox" name="tags" value={name} defaultChecked={facets.selected.tags.includes(name)} />
                    {name} <span className="mono text-steel" style={{ fontSize: "0.66rem" }}>({count})</span>
                  </label>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span className="form-label" style={{ margin: 0 }}>{t.facetProgress}</span>
              <input name="pmin" type="number" min={0} max={100} defaultValue={facets.selected.progressMin ?? ""} placeholder={t.facetProgressMin} className="input" style={{ width: 80 }} />
              <input name="pmax" type="number" min={0} max={100} defaultValue={facets.selected.progressMax ?? ""} placeholder={t.facetProgressMax} className="input" style={{ width: 80 }} />
            </div>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: "0.8rem" }}>
              <input type="checkbox" name="cambios" value="open" defaultChecked={facets.selected.openCambios} />
              {t.facetOpenCambios}
            </label>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span className="form-label" style={{ margin: 0 }}>{t.facetCreated}</span>
              <input name="ffrom" type="date" className="input" style={{ width: 140 }} defaultValue={facets.selected.createdFrom} />
              <input name="fto" type="date" className="input" style={{ width: 140 }} defaultValue={facets.selected.createdTo} />
            </div>
          </div>
        </details>
        <div style={{ display: "flex", gap: 8 }}>
          <SubmitButton className="btn btn-ghost" style={{ padding: "0.45rem 0.7rem", fontSize: "0.74rem" }}>{t.filter}</SubmitButton>
          {named.hasFilters && <Link href={`/app/projects/${projectId}?tab=code&block=${encodeURIComponent(filters.block)}`} className="btn btn-ghost" style={{ padding: "0.45rem 0.7rem", fontSize: "0.74rem" }}>{t.clear}</Link>}
        </div>
      </form>
      {named.hasFilters && named.total === 0 && (
        <div className="tree-empty">{t.noResults}</div>
      )}
      {named.segments.map((s) => (
        <div key={s.id}>
          <div className="tree-folder">
            <span className="tree-folder-name" title={s.name}><Folder size={12} style={{ verticalAlign: -2, marginRight: 6 }} />{s.name}</span>
            <span className="pct">{projectProgress(s.partidas)}%</span>
            {isAdmin && <RenameSegmentForm segmentId={s.id} currentName={s.name} t={t} />}
          </div>
          {s.partidas.map((pa) => (
            <FileRow key={pa.id} pa={pa} selectedId={selectedId} lang={lang} t={t} onSelect={onSelect} rowRef={rowRef} />
          ))}
        </div>
      ))}
      {named.ungrouped.length > 0 && (
        <div>
          <div className="tree-folder" style={{ opacity: 0.7 }}><span className="tree-folder-name"><Folder size={12} style={{ verticalAlign: -2, marginRight: 6 }} />{t.ungrouped}</span></div>
          {named.ungrouped.map((pa) => (
            <FileRow key={pa.id} pa={pa} selectedId={selectedId} lang={lang} t={t} onSelect={onSelect} rowRef={rowRef} />
          ))}
        </div>
      )}
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
