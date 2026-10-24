"use client";
import { useEffect, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { ProjectSearchResultsPanel, type SearchResultsView } from "@/components/project-search-results";

type T = {
  searchObra: string;
  filter: string;
  searchLoading: string;
  searchError: string;
  searchResults: string;
  searchNoResults: string;
  searchInPartidas: string;
  searchInRegistros: string;
  searchInDocumentos: string;
  searchInCambios: string;
};

/**
 * The obra search box. The form stays a GET so it works without JavaScript.
 * With JavaScript, typing searches in place after a short pause.
 */
export function ObraSearch({
  projectId,
  initialQuery,
  initialResults,
  t,
}: {
  projectId: string;
  initialQuery: string;
  initialResults: SearchResultsView | null;
  t: T;
}) {
  const [q, setQ] = useState(initialQuery);
  const [results, setResults] = useState<SearchResultsView | null>(initialResults);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    const timer = window.setTimeout(() => {
      const next = q.trim();
      const url = new URL(window.location.href);
      const current = url.searchParams.get("q") ?? "";
      if (next !== current) {
        if (next) url.searchParams.set("q", next);
        else url.searchParams.delete("q");
        window.history.replaceState(null, "", url);
      }
      if (next.length < 2) {
        setLoading(false);
        setFailed(false);
        setResults(next === initialQuery.trim() ? initialResults : null);
        return;
      }
      if (next === initialQuery.trim() && initialResults) {
        setResults(initialResults);
        setLoading(false);
        setFailed(false);
        return;
      }
      setLoading(true);
      setFailed(false);
      fetch(`/api/projects/${projectId}/search?q=${encodeURIComponent(next)}`, { signal: ac.signal, cache: "no-store" })
        .then(async (res) => {
          if (!res.ok) throw new Error("search");
          setResults(await res.json() as SearchResultsView);
        })
        .catch((e: unknown) => {
          if (e instanceof DOMException && e.name === "AbortError") return;
          setFailed(true);
        })
        .finally(() => {
          if (!ac.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [q, projectId, initialQuery, initialResults]);

  const panelT = {
    searchResults: t.searchResults,
    searchNoResults: t.searchNoResults,
    searchInPartidas: t.searchInPartidas,
    searchInRegistros: t.searchInRegistros,
    searchInDocumentos: t.searchInDocumentos,
    searchInCambios: t.searchInCambios,
  };

  return (
    <>
      <form action={`/app/projects/${projectId}`} style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <input
          name="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.searchObra}
          className="search-input"
          style={{ flex: 1 }}
          aria-label={t.searchObra}
        />
        <SubmitButton className="btn btn-ghost" style={{ fontSize: "0.78rem" }}>{t.filter}</SubmitButton>
      </form>
      {loading && <p className="mono text-steel" style={{ fontSize: "0.78rem", margin: "8px 0 0" }}>{t.searchLoading}</p>}
      {failed && <p role="alert" className="form-error" style={{ marginTop: 8 }}>{t.searchError}</p>}
      {results && <ProjectSearchResultsPanel projectId={projectId} results={results} t={panelT} />}
    </>
  );
}
