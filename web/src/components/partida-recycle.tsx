import type { Partida } from "@prisma/client";
import { formatTimestamp } from "@/lib/format/datetime";
import type { Lang } from "@/i18n/dictionaries";
import { restorePartida, purgePartida } from "@/app/actions/partida-crud";
import { SubmitButton } from "@/components/submit-button";

type RecycleT = { recycleTitle: string; restore: string; deleteForever: string; deletedBy: string; hasRecords: string };
type DeletedRow = Partida & { _count: { registros: number } };

export function PartidaRecycle({
  rows, deleterMap, lang, t,
}: {
  rows: DeletedRow[];
  deleterMap: Map<string, string>;
  lang: Lang;
  t: RecycleT;
}) {
  if (rows.length === 0) return null;
  return (
    <div style={{ marginTop: 20 }}>
      <div className="kicker" style={{ marginBottom: 8 }}>{t.recycleTitle}</div>
      <div className="repo-list">
        {rows.map((p) => (
          <div key={p.id} className="cr-row" style={{ justifyContent: "space-between" }}>
            <span className="cr-main">
              <span className="cr-title" style={{ color: "var(--steel)" }}>{p.name}</span>
              <span className="cr-meta">{t.deletedBy} {p.deletedById ? (deleterMap.get(p.deletedById) ?? "—") : "—"} · {p.deletedAt ? formatTimestamp(p.deletedAt, lang) : ""}</span>
            </span>
            <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <form action={restorePartida}>
                <input type="hidden" name="partidaId" value={p.id} />
                <SubmitButton className="btn btn-ghost" style={{ padding: "0.3rem 0.7rem", fontSize: "0.74rem" }}>{t.restore}</SubmitButton>
              </form>
              {p._count.registros === 0 ? (
                <form action={purgePartida}>
                  <input type="hidden" name="partidaId" value={p.id} />
                  <SubmitButton className="btn btn-accent" style={{ padding: "0.3rem 0.7rem", fontSize: "0.74rem" }}>{t.deleteForever}</SubmitButton>
                </form>
              ) : (
                <span className="mono text-steel" style={{ fontSize: "0.66rem" }}>{t.hasRecords}</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
