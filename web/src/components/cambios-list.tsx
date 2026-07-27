import Link from "next/link";
import type { ChangeStatus, RequestKind, RequestSeverity } from "@prisma/client";
import { formatTimestamp } from "@/lib/format/datetime";
import type { Lang } from "@/i18n/dictionaries";
import { CambiosCreate } from "@/components/cambios-create";

type Row = {
  id: string; code: string; title: string; status: ChangeStatus;
  kind: RequestKind; severity: RequestSeverity;
  createdAt: Date;
  seal: string | null; segmentCount: number;
};
type ListT = {
  empty: string; states: Record<ChangeStatus, string>;
} & React.ComponentProps<typeof CambiosCreate>["t"];

const dotClass: Record<ChangeStatus, string> = { OPEN: "open", INTEGRATED: "merged", REJECTED: "rej" };
const severityClass: Record<RequestSeverity, string> = { IMPORTANT: "is-important", CRITICAL: "is-critical" };

export function CambiosList({
  projectId, rows, partidas, lang, t,
}: {
  projectId: string;
  rows: Row[];
  partidas: { id: string; name: string }[];
  lang: Lang;
  t: ListT;
}) {
  const kindLabel = (k: RequestKind) => (k === "ALERT" ? t.kindAlert : t.kindChange);
  const severityLabel = (s: RequestSeverity) => (s === "CRITICAL" ? t.severityCritical : t.severityImportant);
  return (
    <div>
      <CambiosCreate projectId={projectId} segments={partidas} t={t} />
      <div className="repo-list">
        {rows.length === 0 && <div className="repo-list-empty">{t.empty}</div>}
        {rows.map((r) => (
          <Link key={r.id} href={`/app/projects/${projectId}/cambios/${r.id}`} className="cr-row">
            <span className={`pdot ${dotClass[r.status]}`} aria-hidden="true" />
            <span className="cr-main">
              <span className="cr-title">
                {r.code} · {r.title} <span className={`severity-chip ${severityClass[r.severity]}`}>{severityLabel(r.severity)}</span>
              </span>
              <span className="cr-meta">{kindLabel(r.kind)} · {r.segmentCount} · {t.states[r.status]} · {formatTimestamp(r.createdAt, lang)}{r.seal ? ` · ${r.seal.slice(0, 7)}` : ""}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
