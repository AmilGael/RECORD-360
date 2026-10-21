"use client";
import { useEffect, useMemo, useState } from "react";
import { FileText } from "@/components/icons";
import { matchesPlanosQuery } from "@/lib/planos/match";

export type PlanoCard = {
  id: string;
  url: string;
  thumbUrl: string | null;
  name: string;
  fileName: string | null;
  fileType: string;
  kind: string;
  uploader: string;
  dateText: string;
};

type T = {
  empty: string;
  uploadedBy: string;
  search: string;
  searchCount: string;
  searchEmpty: string;
  searchClear: string;
  updated: string;
};

function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
}

export function PlanosGrid({ docs, initialQuery, t }: { docs: PlanoCard[]; initialQuery: string; t: T }) {
  const [q, setQ] = useState(initialQuery);
  const filtered = useMemo(() => docs.filter((d) => matchesPlanosQuery(d, q)), [docs, q]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      const url = new URL(window.location.href);
      const current = url.searchParams.get("pq") ?? "";
      const next = q.trim();
      if (next === current) return;
      if (next) url.searchParams.set("pq", next);
      else url.searchParams.delete("pq");
      window.history.replaceState(null, "", url);
    }, 250);
    return () => window.clearTimeout(id);
  }, [q]);

  if (docs.length === 0) return <div className="repo-list-empty">{t.empty}</div>;

  return (
    <div>
      <div className="planos-toolbar">
        <label className="planos-search">
          <span className="kicker">{t.search}</span>
          <input
            type="search"
            enterKeyHint="search"
            className="input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label={t.search}
          />
        </label>
        <div className="planos-search-meta">
          <span className="mono">{fill(t.searchCount, { shown: filtered.length, total: docs.length })}</span>
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="repo-list-empty">
          <p>{t.searchEmpty}</p>
          <button type="button" className="btn btn-ghost planos-search-clear" onClick={() => setQ("")}>{t.searchClear}</button>
        </div>
      ) : (
        <div className="planos-grid">
          {filtered.map((d) => (
            <a key={d.id} href={d.url} target="_blank" rel="noopener noreferrer" className="planos-card">
              <div className="planos-thumb">
                {d.thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={d.thumbUrl} alt="" width={480} height={360} loading="lazy" decoding="async" />
                ) : (
                  <div className="planos-thumb-fallback">
                    <FileText size={22} />
                    <span className="mono">{d.fileType}</span>
                  </div>
                )}
              </div>
              <div className="planos-card-body">
                <div className="planos-card-name">{d.name}</div>
                <div className="planos-card-meta">
                  {t.uploadedBy} {d.uploader} · {d.dateText}
                  {d.kind === "PLANO_ACTUALIZADO" && (
                    <> · <span className="state-badge is-active">{t.updated}</span></>
                  )}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
