import Link from "next/link";
import type { AttachmentType, Document, DocumentKind, Registro } from "@prisma/client";
import type { Lang } from "@/i18n/dictionaries";
import { formatTimestamp } from "@/lib/format/datetime";
import type { ReactNode } from "react";
import { PlanosUpload } from "@/components/planos-upload";
import { SubmitButton } from "@/components/submit-button";
import { resolveReminder } from "@/app/actions/reminders";
import { closeSegment, reopenSegment } from "@/app/actions/lifecycle";
import { spaceHref, type PreservedParams } from "@/lib/project/space-links";

type SegmentSummary = { id: string; name: string; progress: number; count: number; closedAt: Date | string | null };
// "Indicadores" was removed in WS4F: its core numbers (progress %, partida
// count) duplicated the Analítica tab's per-bloque breakdown, and the remaining
// block-scoped extras were not worth a nav entry. "Planos" stays: unlike the
// project-wide Planos tab (which always uploads with no segmentId), this space
// is the only place a document can be attached to a specific bloque — not a
// duplicate. "Solicitudes" is block-scoped here: requests created from this
// space are locked to the selected bloque.
export type SpaceKey = "cuaderno" | "solicitudes" | "planos" | "levantamientos" | "ideas" | "media" | "recordatorios";
type MediaItem = { id: string; url: string; fileType: AttachmentType; text: string | null; createdAt: Date };
type NoteItem = Pick<Registro, "id" | "text" | "serverCreatedAt" | "hash" | "partidaId"> & { partidaName: string };

const SPACES: { key: SpaceKey; label: string; kind?: DocumentKind }[] = [
  { key: "cuaderno", label: "Cuaderno" },
  { key: "solicitudes", label: "Solicitudes" },
  { key: "planos", label: "Planos", kind: "PLANO" },
  { key: "levantamientos", label: "Levantamientos", kind: "LEVANTAMIENTO" },
  { key: "ideas", label: "Ideas", kind: "IDEA" },
  { key: "media", label: "Media" },
  { key: "recordatorios", label: "Recordatorios" },
];

export function BloqueSpacesPanel({
  projectId, segments, selectedSegmentId, selectedSpace, docs, notes, media, reminders, requestsContent, canUpload, canResolve, canManageLifecycle, preserved, lang, t,
}: {
  projectId: string;
  segments: SegmentSummary[];
  selectedSegmentId: string | null;
  selectedSpace: SpaceKey;
  docs: Document[];
  notes: NoteItem[];
  media: MediaItem[];
  reminders: NoteItem[];
  requestsContent?: ReactNode;
  canUpload: boolean;
  canResolve: boolean;
  canManageLifecycle: boolean;
  preserved: PreservedParams;
  lang: Lang;
  t: {
    emptyDocs: string; upload: string; uploadByKind: Record<DocumentKind, string>; title: string; error: string; uploadedBy: string; view: string; resolve: string;
    blockClosed: string; closeBlock: string; reopenBlock: string;
  };
}) {
  if (segments.length === 0 || !selectedSegmentId) return null;
  const selected = segments.find((s) => s.id === selectedSegmentId) ?? segments[0];
  const space = SPACES.find((s) => s.key === selectedSpace) ?? SPACES[0];
  const isClosed = Boolean(selected.closedAt);
  const grouped = media.reduce<Record<AttachmentType, MediaItem[]>>((acc, item) => {
    acc[item.fileType] ??= [];
    acc[item.fileType].push(item);
    return acc;
  }, { IMAGE: [], VIDEO: [], PDF: [], AUDIO: [] });

  return (
    <section className="space-panel">
      <aside className="space-nav" aria-label="Bloque spaces">
        <div className="space-nav-title">Bloques</div>
        {segments.map((s) => (
          <Link key={s.id} href={spaceHref(projectId, preserved, s.id, selectedSpace)} className={`space-block${s.id === selected.id ? " is-on" : ""}`}>
            <span>{s.name}</span>
            <span>{s.progress}%</span>
          </Link>
        ))}
        <div className="space-nav-title">Espacios</div>
        {SPACES.map((s) => (
          <Link key={s.key} href={spaceHref(projectId, preserved, selected.id, s.key)} className={`space-link${s.key === selectedSpace ? " is-on" : ""}`}>{s.label}</Link>
        ))}
      </aside>
      <div className="space-main">
        <div className="space-head">
          <div>
            <div className="mono text-steel" style={{ fontSize: 11 }}>Obra / Bloque / {space.label}</div>
            <h2 className="h-md" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {selected.name}
              {isClosed && <span className="state-badge is-archived">{t.blockClosed}</span>}
            </h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {canManageLifecycle && (
              <form action={isClosed ? reopenSegment : closeSegment}>
                <input type="hidden" name="segmentId" value={selected.id} />
                <SubmitButton className="btn btn-ghost" style={{ padding: "0.3rem 0.7rem", fontSize: "0.72rem" }}>
                  {isClosed ? t.reopenBlock : t.closeBlock}
                </SubmitButton>
              </form>
            )}
            <div className="space-meter"><span>{selected.progress}%</span><small>{selected.count} partidas</small></div>
          </div>
        </div>

        {space.kind && (
          <>
            {canUpload && <PlanosUpload projectId={projectId} segmentId={selected.id} kind={space.kind} t={{ upload: t.uploadByKind[space.kind] ?? t.upload, title: t.title, error: t.error }} />}
            <DocList docs={docs} lang={lang} t={t} />
          </>
        )}
        {space.key === "cuaderno" && <NotesList notes={notes} lang={lang} />}
        {space.key === "solicitudes" && requestsContent}
        {space.key === "media" && <MediaGroups grouped={grouped} />}
        {space.key === "recordatorios" && <RemindersList reminders={reminders} lang={lang} canResolve={canResolve} resolveLabel={t.resolve} />}
      </div>
    </section>
  );
}

function DocList({ docs, lang, t }: { docs: Document[]; lang: Lang; t: { emptyDocs: string; uploadedBy: string; view: string } }) {
  return (
    <div className="repo-list">
      {docs.length === 0 && <div className="repo-list-empty">{t.emptyDocs}</div>}
      {docs.map((d) => (
        <div key={d.id} className="cr-row" style={{ justifyContent: "space-between" }}>
          <span className="cr-main">
            <span className="cr-title">{d.title || d.url.split("/").pop()}</span>
            <span className="cr-meta">{formatTimestamp(d.createdAt, lang)}</span>
          </span>
          <a href={d.url} target="_blank" rel="noopener noreferrer" className="mono" style={{ fontSize: 12, color: "var(--accent-deep)", textDecoration: "none", border: "1px solid var(--line-strong)", borderRadius: "var(--radius-sm)", padding: "6px 10px", whiteSpace: "nowrap" }}>
            {t.view}
          </a>
        </div>
      ))}
    </div>
  );
}

function NotesList({ notes, lang, empty = "Sin registros en este bloque." }: { notes: NoteItem[]; lang: Lang; empty?: string }) {
  return (
    <div className="repo-list">
      {notes.length === 0 && <div className="repo-list-empty">{empty}</div>}
      {notes.map((n) => (
        <Link key={n.id} href={`/app/partidas/${n.partidaId}`} className="cr-row">
          <span className="cr-main">
            <span className="cr-title">{n.partidaName}</span>
            <span className="cr-meta">{formatTimestamp(n.serverCreatedAt, lang)} · HASH {n.hash.slice(0, 8)}…</span>
            <span style={{ display: "block", marginTop: 5 }}>{n.text ?? "Registro sin texto"}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}

function RemindersList({ reminders, lang, canResolve, resolveLabel }: { reminders: NoteItem[]; lang: Lang; canResolve: boolean; resolveLabel: string }) {
  return (
    <div className="repo-list">
      {reminders.length === 0 && <div className="repo-list-empty">Sin recordatorios vencidos o próximos.</div>}
      {reminders.map((n) => (
        <div key={n.id} className="cr-row" style={{ justifyContent: "space-between" }}>
          <Link href={`/app/partidas/${n.partidaId}`} className="cr-main">
            <span className="cr-title">{n.partidaName}</span>
            <span className="cr-meta">{formatTimestamp(n.serverCreatedAt, lang)} · HASH {n.hash.slice(0, 8)}…</span>
            <span style={{ display: "block", marginTop: 5 }}>{n.text ?? "Registro sin texto"}</span>
          </Link>
          {canResolve && (
            <form action={resolveReminder}>
              <input type="hidden" name="registroId" value={n.id} />
              <SubmitButton className="btn btn-ghost" style={{ padding: "0.3rem 0.7rem", fontSize: "0.74rem", whiteSpace: "nowrap" }}>{resolveLabel}</SubmitButton>
            </form>
          )}
        </div>
      ))}
    </div>
  );
}

function MediaGroups({ grouped }: { grouped: Record<AttachmentType, MediaItem[]> }) {
  return (
    <div className="media-groups">
      {(["IMAGE", "VIDEO", "AUDIO", "PDF"] as AttachmentType[]).map((kind) => (
        <div key={kind} className="media-group">
          <div className="media-group-head">{kind}</div>
          {grouped[kind].length === 0 ? <span className="text-steel">Sin archivos.</span> : grouped[kind].map((m) => (
            <a key={m.id} href={m.url} target="_blank" rel="noopener noreferrer">{m.text || m.url.split("/").pop()}</a>
          ))}
        </div>
      ))}
    </div>
  );
}
