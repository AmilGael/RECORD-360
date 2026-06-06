import Link from "next/link";
import type { ChangeStatus } from "@prisma/client";
import { formatTimestamp } from "@/lib/format/datetime";
import type { Lang } from "@/i18n/dictionaries";
import { CambiosCreate } from "@/components/cambios-create";

type Row = {
  id: string; code: string; title: string; status: ChangeStatus;
  createdAt: Date;
  seal: string | null; segmentCount: number;
};
type ListT = {
  empty: string; states: Record<ChangeStatus, string>;
} & React.ComponentProps<typeof CambiosCreate>["t"];

const dotClass: Record<ChangeStatus, string> = { OPEN: "open", INTEGRATED: "merged", REJECTED: "rej" };

export function CambiosList({
  projectId, rows, partidas, lang, t,
}: {
  projectId: string;
  rows: Row[];
  partidas: { id: string; name: string }[];
  lang: Lang;
  t: ListT;
}) {
  return (
    <div>
      <CambiosCreate projectId={projectId} segments={partidas} t={t} />
      <div className="repo-list">
        {rows.length === 0 && <div className="repo-list-empty">{t.empty}</div>}
        {rows.map((r) => (
          <Link key={r.id} href={`/app/projects/${projectId}/cambios/${r.id}`} className="cr-row">
            <span className={`pdot ${dotClass[r.status]}`} aria-hidden="true" />
            <span className="cr-main">
              <span className="cr-title">{r.code} · {r.title}</span>
              <span className="cr-meta">{r.segmentCount} · {t.states[r.status]} · {formatTimestamp(r.createdAt, lang)}{r.seal ? ` · ${r.seal.slice(0, 7)}` : ""}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
