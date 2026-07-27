import type { Document } from "@prisma/client";
import { formatTimestamp } from "@/lib/format/datetime";
import type { Lang } from "@/i18n/dictionaries";
import { PlanosUpload } from "@/components/planos-upload";

type PlanosT = {
  empty: string; upload: string; title: string; error: string; uploadedBy: string; view: string;
};

export function PlanosTab({
  projectId, docs, authorMap, lang, isAdmin, t,
}: {
  projectId: string;
  docs: Document[];
  authorMap: Map<string, string>;
  lang: Lang;
  isAdmin: boolean;
  t: PlanosT;
}) {
  return (
    <div>
      {isAdmin && <PlanosUpload projectId={projectId} t={{ upload: t.upload, title: t.title, error: t.error }} />}
      <div className="repo-list">
        {docs.length === 0 && <div className="repo-list-empty">{t.empty}</div>}
        {docs.map((d) => (
          <div key={d.id} className="cr-row" style={{ justifyContent: "space-between" }}>
            <span className="cr-main">
              <span className="cr-title">{d.title || d.url.split("/").pop()}</span>
              <span className="cr-meta">{t.uploadedBy} {authorMap.get(d.uploadedById) ?? "—"} · {formatTimestamp(d.createdAt, lang)}</span>
            </span>
            <a href={d.url} target="_blank" rel="noopener noreferrer" className="mono" style={{ fontSize: 12, color: "var(--accent-deep)", textDecoration: "none", border: "1px solid var(--line-strong)", borderRadius: "var(--radius-sm)", padding: "6px 10px", maxWidth: "100%", lineHeight: 1.25, overflowWrap: "anywhere" }}>
              {t.view}
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
