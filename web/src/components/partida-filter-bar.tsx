"use client";
import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import { Search } from "@/components/icons";
import { projectTabHref } from "@/lib/project/tabs";

export type PartidaFilterBarT = {
  searchPartidas: string; filter: string; clear: string;
  facetTags: string; facetProgress: string; facetProgressMin: string; facetProgressMax: string;
  facetOpenCambios: string; facetCreated: string;
};

export type PartidaFacets = {
  tagCounts: [string, number][];
  selected: { tags: string[]; progressMin: number | null; progressMax: number | null; openCambios: boolean; createdFrom: string; createdTo: string };
  hasActive: boolean;
};

/**
 * Search bar on top of the partida cards, with the facet filters folded under
 * it. The name box is controlled by the caller, which filters the cards as the
 * user types (accent-insensitive) and keeps `q` in the URL; the facets submit
 * as a GET form to the Partidas route.
 */
export function PartidaFilterBar({
  projectId, block, q, onQueryChange, onClear, hasFilters, facets, t,
}: {
  projectId: string;
  /** The workspace's bloque, kept across facet submissions. */
  block: string;
  q: string;
  onQueryChange: (q: string) => void;
  /** Called when "Clear" is followed, so the caller can empty the box too. */
  onClear: () => void;
  hasFilters: boolean;
  facets: PartidaFacets;
  t: PartidaFilterBarT;
}) {
  return (
    <form action={projectTabHref(projectId, "partidas")} className="tree-filter partida-filter-bar">
      <label className="search-wrap" style={{ marginBottom: 0 }}>
        <span className="icon"><Search size={13} /></span>
        <input
          name="q"
          value={q}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={t.searchPartidas}
          className="search-input"
        />
      </label>
      {/* WS4F: the active block is fixed by the workspace context (Bloques
          overview / space nav switch it), not by a second selector nested
          inside this filter form — a hidden field just preserves it across
          facet-only submissions. */}
      <input type="hidden" name="block" value={block} />
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
        {hasFilters && (
          <Link
            href={projectTabHref(projectId, "partidas", { block })}
            onClick={onClear}
            className="btn btn-ghost"
            style={{ padding: "0.45rem 0.7rem", fontSize: "0.74rem" }}
          >
            {t.clear}
          </Link>
        )}
      </div>
    </form>
  );
}
