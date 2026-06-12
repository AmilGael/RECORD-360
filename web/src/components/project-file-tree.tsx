import Link from "next/link";
import { createPartida, createSegment } from "@/app/actions/admin";
import { SubmitButton } from "@/components/submit-button";
import { Folder, Search } from "@/components/icons";
import { MovePartidaForm, RenamePartidaForm, RenameSegmentForm } from "@/components/project-edit-controls";
import { UNGROUPED_FILTER } from "@/lib/project/partida-filter";
import { projectProgress } from "@/lib/project/progress";
import { setPartidaTags } from "@/app/actions/partida-tags";

type PartidaRow = {
  id: string;
  name: string;
  progressPct: number;
  segmentId?: string | null;
  tags?: { tag: { name: string } }[];
};
type TreeT = {
  ungrouped: string; newPartida: string; add: string;
  segmentPlaceholder: string; newSegment: string; addSegment: string;
  rename: string; save: string; move: string; moveTo: string;
  searchPartidas: string; allBlocks: string; filter: string; clear: string; noResults: string;
  facetTags: string; facetProgress: string; facetProgressMin: string; facetProgressMax: string;
  facetOpenCambios: string; facetCreated: string;
};

type FacetsState = {
  tagCounts: [string, number][];
  selected: { tags: string[]; progressMin: number | null; progressMax: number | null; openCambios: boolean };
  hasActive: boolean;
};

type SegmentOption = { id: string; name: string };

type FilterState = { q: string; block: string; tags: string[]; progressMin: number | null; progressMax: number | null; openCambios: boolean; createdFrom: Date | null; createdTo: Date | null; total: number; hasFilters: boolean };

function projectHref(projectId: string, params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const qs = search.toString();
  return `/app/projects/${projectId}${qs ? `?${qs}` : ""}`;
}

function FileRow({
  projectId, pa, selectedId, isAdmin, segments, t, filters,
}: {
  projectId: string;
  pa: PartidaRow;
  selectedId?: string;
  isAdmin: boolean;
  segments: SegmentOption[];
  t: TreeT;
  filters: FilterState;
}) {
  return (
    <div className={`tree-row${pa.id === selectedId ? " is-active" : ""}`}>
      <Link
        href={projectHref(projectId, { p: pa.id, q: filters.q, block: filters.block })}
        className="tree-file"
        aria-label={`${pa.name} — ${pa.progressPct}%`}
      >
        <span className="tree-file-name">{pa.name}</span>
        <span className="pct">{pa.progressPct}%</span>
      </Link>
      {isAdmin && (
        <div className="tree-row-actions">
          <RenamePartidaForm partidaId={pa.id} currentName={pa.name} t={t} />
          <MovePartidaForm partidaId={pa.id} currentSegmentId={pa.segmentId ?? null} segments={segments} t={t} />
          <form action={setPartidaTags} className="tag-edit">
            <input type="hidden" name="partidaId" value={pa.id} />
            <input name="tags" defaultValue={(pa.tags ?? []).map((x) => x.tag.name).join(", ")} className="input" aria-label="Tags" />
            <SubmitButton className="btn btn-ghost">{t.save}</SubmitButton>
          </form>
        </div>
      )}
      {pa.tags && pa.tags.length > 0 && (
        <div className="tag-line">
          {pa.tags.map((x) => <span key={x.tag.name} className="chip">{x.tag.name}</span>)}
        </div>
      )}
    </div>
  );
}

export function ProjectFileTree({
  projectId, segments, ungrouped, segmentNames, segmentOptions, selectedId, isAdmin, filters, facets, t,
}: {
  projectId: string;
  segments: { id: string; name: string; partidas: PartidaRow[] }[];
  ungrouped: PartidaRow[];
  segmentNames: string[];
  segmentOptions: SegmentOption[];
  selectedId?: string;
  isAdmin: boolean;
  filters: FilterState;
  facets: FacetsState;
  t: TreeT;
}) {
  const segListId = `segment-opts-${projectId}`;
  return (
    <div className="tree">
      <form action={`/app/projects/${projectId}`} className="tree-filter">
        <input type="hidden" name="tab" value="code" />
        <label className="search-wrap" style={{ marginBottom: 0 }}>
          <span className="icon"><Search size={13} /></span>
          <input name="q" defaultValue={filters.q} placeholder={t.searchPartidas} className="search-input" />
        </label>
        <select name="block" defaultValue={filters.block} className="input" aria-label={t.filter}>
          <option value="">{t.allBlocks}</option>
          <option value={UNGROUPED_FILTER}>{t.ungrouped}</option>
          {segmentOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
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
              <input name="ffrom" type="date" className="input" style={{ width: 140 }} />
              <input name="fto" type="date" className="input" style={{ width: 140 }} />
            </div>
          </div>
        </details>
        <div style={{ display: "flex", gap: 8 }}>
          <SubmitButton className="btn btn-ghost" style={{ padding: "0.45rem 0.7rem", fontSize: "0.74rem" }}>{t.filter}</SubmitButton>
          {filters.hasFilters && <Link href={`/app/projects/${projectId}?tab=code&block=${encodeURIComponent(filters.block)}`} className="btn btn-ghost" style={{ padding: "0.45rem 0.7rem", fontSize: "0.74rem" }}>{t.clear}</Link>}
        </div>
      </form>
      {filters.hasFilters && filters.total === 0 && (
        <div className="tree-empty">{t.noResults}</div>
      )}
      {segments.map((s) => (
        <div key={s.id}>
          <div className="tree-folder">
            <span className="tree-folder-name"><Folder size={12} style={{ verticalAlign: -2, marginRight: 6 }} />{s.name}</span>
            <span className="pct">{projectProgress(s.partidas)}%</span>
            {isAdmin && <RenameSegmentForm segmentId={s.id} currentName={s.name} t={t} />}
          </div>
          {s.partidas.map((pa) => <FileRow key={pa.id} projectId={projectId} pa={pa} selectedId={selectedId} isAdmin={isAdmin} segments={segmentOptions} t={t} filters={filters} />)}
        </div>
      ))}
      {ungrouped.length > 0 && (
        <div>
          <div className="tree-folder" style={{ opacity: 0.7 }}><span className="tree-folder-name"><Folder size={12} style={{ verticalAlign: -2, marginRight: 6 }} />{t.ungrouped}</span></div>
          {ungrouped.map((pa) => <FileRow key={pa.id} projectId={projectId} pa={pa} selectedId={selectedId} isAdmin={isAdmin} segments={segmentOptions} t={t} filters={filters} />)}
        </div>
      )}
      {isAdmin && (
        <div className="tree-actions">
          <form action={createPartida} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <input type="hidden" name="projectId" value={projectId} />
            <input name="name" placeholder={t.newPartida} required className="input" />
            <input name="segment" list={segListId} placeholder={t.segmentPlaceholder} className="input" />
            <datalist id={segListId}>
              {segmentNames.map((n) => <option key={n} value={n} />)}
            </datalist>
            <SubmitButton className="btn btn-accent" style={{ padding: "0.5rem 0.85rem", fontSize: "0.82rem" }}>{t.add}</SubmitButton>
          </form>
          <form action={createSegment} style={{ display: "flex", gap: 6 }}>
            <input type="hidden" name="projectId" value={projectId} />
            <input name="name" placeholder={t.newSegment} required className="input" style={{ flex: 1 }} />
            <SubmitButton className="btn btn-ghost" style={{ padding: "0.5rem 0.7rem", fontSize: "0.78rem" }}>{t.addSegment}</SubmitButton>
          </form>
        </div>
      )}
    </div>
  );
}
