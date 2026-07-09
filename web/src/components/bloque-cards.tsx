import Link from "next/link";
import { createSegment } from "@/app/actions/admin";
import { SubmitButton } from "@/components/submit-button";
import { DeleteSegmentButton } from "@/components/delete-segment-button";
import { Layers, Plus } from "@/components/icons";
import { UNGROUPED_FILTER } from "@/lib/project/partida-filter";

export type BloqueCard = { id: string; name: string; progress: number; count: number; deletable: boolean };

type T = {
  bloquesTitle: string; bloqueCard: string; openBloque: string; ungrouped: string;
  newSegment: string; addSegment: string; deleteBloque: string; deleteBloqueConfirm: string; yes: string; no: string;
};

export function BloqueCards({ projectId, bloques, ungroupedCount, canEdit, isOwner, t }: {
  projectId: string;
  bloques: BloqueCard[];
  ungroupedCount: number;
  canEdit: boolean;
  isOwner: boolean;
  t: T;
}) {
  return (
    <div style={{ marginTop: 16 }}>
      <div className="kicker" style={{ marginBottom: 10 }}>{t.bloquesTitle}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 12 }}>
        {bloques.map((b) => (
          <div key={b.id} className="card" style={{ padding: 14 }}>
            <Link href={`/app/projects/${projectId}?block=${b.id}`} style={{ textDecoration: "none", color: "inherit" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Layers size={14} />
                <strong>{b.name}</strong>
              </div>
              <div className="mono text-steel" style={{ fontSize: "0.72rem", marginBottom: 8 }}>
                {b.count} {t.bloqueCard} · {b.progress}%
              </div>
              <div className="progress-track" aria-hidden="true">
                <div className={`progress-fill${b.progress >= 100 ? " is-done" : ""}`} style={{ width: `${b.progress}%` }} />
              </div>
            </Link>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
              <Link href={`/app/projects/${projectId}?block=${b.id}`} className="mono" style={{ fontSize: "0.7rem", color: "var(--accent-deep)", textDecoration: "none" }}>
                {t.openBloque}
              </Link>
              {isOwner && b.deletable && (
                <DeleteSegmentButton segmentId={b.id} t={{ deleteBloque: t.deleteBloque, deleteBloqueConfirm: t.deleteBloqueConfirm, yes: t.yes, no: t.no }} />
              )}
            </div>
          </div>
        ))}
        {ungroupedCount > 0 && (
          <Link href={`/app/projects/${projectId}?block=${UNGROUPED_FILTER}`} className="card" style={{ padding: 14, textDecoration: "none", color: "inherit" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Layers size={14} />
              <strong>{t.ungrouped}</strong>
            </div>
            <div className="mono text-steel" style={{ fontSize: "0.72rem" }}>{ungroupedCount} {t.bloqueCard}</div>
          </Link>
        )}
        {canEdit && (
          <form action={createSegment} className="card" style={{ padding: 14, display: "grid", gap: 8, alignContent: "start" }}>
            <input type="hidden" name="projectId" value={projectId} />
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}><Plus size={12} /><span className="form-label" style={{ margin: 0 }}>{t.addSegment}</span></div>
            <input name="name" required placeholder={t.newSegment} className="input" />
            <SubmitButton className="btn btn-ghost" style={{ justifySelf: "start" }}>{t.addSegment}</SubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}
