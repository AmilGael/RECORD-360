import Link from "next/link";
import type { Lang } from "@/i18n/dictionaries";
import type { PartidaPreview } from "@/lib/partida/preview";
import { formatRecordTime } from "@/lib/format/datetime";
import { Pin } from "@/components/icons";

export type PartidaPanelShell = {
  id: string;
  name: string;
  progressPct: number;
  completedAt: string | null;
  tags: string[];
  segmentName: string | null;
  segmentClosedAt: string | null;
};

export type PanelCopy = {
  empty: string;
  noEntries: string;
  newRegistro: string;
  openCuaderno: string;
  editPartida: string;
  panelOffline: string;
  panelClose: string;
  progress: string;
  save: string;
  conclude: string;
  reopen: string;
  concluded: string;
  concludedOn: string;
  rename: string;
  move: string;
  moveTo: string;
  ungrouped: string;
  tagsLabel: string;
};

type SegmentOption = { id: string; name: string };

export function PartidaPanelView({
  shell,
  preview,
  canEdit,
  lang,
  t,
  open,
  headingRef,
  formError,
  busy,
  offline,
  segments,
  onClose,
  onProgress,
  onConclude,
  onReopen,
  onRename,
  onMove,
  onTags,
}: {
  shell: PartidaPanelShell | null;
  preview: PartidaPreview | null;
  canEdit: boolean;
  lang: Lang;
  t: PanelCopy;
  open: boolean;
  headingRef: (el: HTMLHeadingElement | null) => void;
  formError: string | null;
  busy: boolean;
  offline: boolean;
  segments: SegmentOption[];
  onClose: () => void;
  onProgress: (partidaId: string, progressPct: number) => void;
  onConclude: (partidaId: string) => void;
  onReopen: (partidaId: string) => void;
  onRename: (partidaId: string, name: string) => void;
  onMove: (partidaId: string, segmentId: string) => void;
  onTags: (partidaId: string, tags: string) => void;
}) {
  if (!open || !shell) {
    return (
      <div className="workspace-panel" aria-hidden="true" inert>
        <div className="viewport"><div className="empty">{t.empty}</div></div>
      </div>
    );
  }

  const name = preview?.name ?? shell.name;
  const progressPct = preview?.progressPct ?? shell.progressPct;
  const completedAt = preview?.completedAt ?? shell.completedAt;
  const tags = preview?.tags ?? shell.tags;
  const segmentName = preview?.segment?.name ?? shell.segmentName;
  const segmentClosed = Boolean(preview?.segment?.closedAt ?? shell.segmentClosedAt);
  const concluded = Boolean(completedAt);
  const showEdit = canEdit;

  return (
    <div className="workspace-panel is-open" role="region" aria-label={name}>
      <div className="panel-grab" aria-hidden="true" />
      <div className="viewport">
        <div className="panel-toolbar">
          <div style={{ minWidth: 0 }}>
            {segmentName && <div className="kicker">{segmentName}</div>}
            <h2 className="h-md" tabIndex={-1} ref={headingRef} style={{ margin: "4px 0 6px" }}>{name}</h2>
            {concluded
              ? <span className="state-badge is-concluded">{t.concluded}</span>
              : <span className="state-badge is-active">{progressPct}%</span>}
          </div>
          <button type="button" className="panel-close" onClick={onClose}>{t.panelClose}</button>
        </div>
        <div className="panel-progress-track" aria-hidden="true">
          <i className={`panel-progress-band${concluded ? " is-done" : ""}`} style={{ width: `${Math.min(Math.max(progressPct, 0), 100)}%` }} />
        </div>
        <div className="panel-actions">
          <Link href={`/app/partidas/${shell.id}#composer`} className="btn btn-accent">{t.newRegistro}</Link>
          <Link href={`/app/partidas/${shell.id}`} className="btn btn-ink">{t.openCuaderno}</Link>
        </div>
        {offline && (
          <p role="alert" className="capture-notice is-failed">
            {t.panelOffline}
            <Link href={`/app/partidas/${shell.id}`} className="btn btn-ghost" style={{ marginTop: 8, display: "inline-flex" }}>{t.openCuaderno}</Link>
          </p>
        )}
        {formError && (
          <p role="alert" className="mono" style={{ fontSize: "0.74rem", color: "var(--accent-deep)", margin: "0 0 10px" }}>{formError}</p>
        )}
        {preview && preview.registros.length === 0 && <p className="text-steel" style={{ fontSize: "0.88rem" }}>{t.noEntries}</p>}
        {preview?.registros.map((r) => (
          <div key={r.id} className="panel-entry">
            {r.firstImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.firstImageUrl} alt="" className="panel-thumb" />
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="mono text-steel" style={{ fontSize: "0.62rem", display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 4 }}>
                {r.category && <span>{r.category}</span>}
                {r.locationLabel && <span><Pin size={11} style={{ verticalAlign: -2, marginRight: 3 }} />{r.locationLabel}</span>}
                <span>{formatRecordTime(new Date(r.serverCreatedAt), lang)}</span>
                {r.authorName && <span>{r.authorName}</span>}
              </div>
              {r.text && <p style={{ fontSize: "0.88rem", margin: 0 }}>{r.text}</p>}
            </div>
          </div>
        ))}
        {showEdit && !concluded && (
          <>
            <form
              className="progress-edit"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const n = Number(fd.get("progressPct"));
                if (!Number.isFinite(n)) return;
                onProgress(shell.id, n);
              }}
            >
              <label className="form-label" htmlFor={`panel-progress-${shell.id}`}>{t.progress}</label>
              <input
                id={`panel-progress-${shell.id}`}
                type="number"
                name="progressPct"
                min={0}
                max={99}
                step={1}
                defaultValue={Math.min(progressPct, 99)}
                key={`progress-${shell.id}-${progressPct}`}
                className="input"
              />
              <button type="submit" className="btn btn-ghost" disabled={busy}>{t.save}</button>
            </form>
            <form
              style={{ marginBottom: 8 }}
              onSubmit={(e) => {
                e.preventDefault();
                onConclude(shell.id);
              }}
            >
              <button type="submit" className="btn btn-ghost" style={{ padding: "0.3rem 0.7rem", fontSize: "0.72rem" }} disabled={busy}>
                {t.conclude}
              </button>
            </form>
          </>
        )}
        {showEdit && concluded && (
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 8 }}>
            <div>
              <div className="mono" style={{ fontSize: "0.8rem" }}>{t.concluded} · 100%</div>
              {completedAt && (
                <div className="kicker" style={{ color: "var(--steel)" }}>
                  {t.concludedOn} {formatRecordTime(new Date(completedAt), lang)}
                </div>
              )}
            </div>
            {!segmentClosed && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  onReopen(shell.id);
                }}
              >
                <button type="submit" className="btn btn-ghost" style={{ padding: "0.3rem 0.7rem", fontSize: "0.72rem" }} disabled={busy}>
                  {t.reopen}
                </button>
              </form>
            )}
          </div>
        )}
        {showEdit && (
          <details className="inline-edit" style={{ display: "block", marginTop: 12 }}>
            <summary>{t.editPartida}</summary>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onRename(shell.id, String(new FormData(e.currentTarget).get("name") ?? ""));
              }}
            >
              <input name="name" defaultValue={name} required className="input" key={`name-${shell.id}-${name}`} aria-label={t.rename} />
              <button type="submit" className="btn btn-ghost" disabled={busy}>{t.save}</button>
            </form>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onMove(shell.id, String(new FormData(e.currentTarget).get("segmentId") ?? ""));
              }}
            >
              <select
                name="segmentId"
                defaultValue={preview?.segment?.id ?? ""}
                className="input"
                aria-label={t.moveTo}
                key={`seg-${shell.id}-${preview?.segment?.id ?? ""}`}
              >
                <option value="">{t.ungrouped}</option>
                {segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <button type="submit" className="btn btn-ghost" disabled={busy}>{t.save}</button>
            </form>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onTags(shell.id, String(new FormData(e.currentTarget).get("tags") ?? ""));
              }}
            >
              <input
                name="tags"
                defaultValue={tags.join(", ")}
                className="input"
                aria-label={t.tagsLabel}
                key={`tags-${shell.id}-${tags.join(",")}`}
              />
              <button type="submit" className="btn btn-ghost" disabled={busy}>{t.save}</button>
            </form>
          </details>
        )}
      </div>
    </div>
  );
}
